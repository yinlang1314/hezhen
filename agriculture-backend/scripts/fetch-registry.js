#!/usr/bin/env node
/**
 * 从「中国农药信息网」(icama.cn) 抓真实农药登记数据，写入病害的用药字段
 *
 *   node scripts/fetch-registry.js                # 处理库里所有病害
 *   node scripts/fetch-registry.js --only=稻瘟病    # 只处理一个
 *   node scripts/fetch-registry.js --dry-run      # 只抓不写库
 *   node scripts/fetch-registry.js --limit=5      # 最多处理 5 条
 *
 * 数据来源：农业农村部农药检定所 中国农药信息网 农药登记数据（公开查询）
 * 每条用药都会带上「登记证号」，可追溯到官方登记记录。
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbRun, dbAll } = require('../config/db')

const BASE = 'https://www.icama.cn/BasicdataSystem/pesticideRegistration/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const missingOnly = args.includes('--missing')
const refreshAll = args.includes('--refresh')
const onlyArg = args.find((a) => a.startsWith('--only='))
const only = onlyArg ? decodeURIComponent(onlyArg.split('=')[1]) : ''
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) || 999 : 999

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

// 常见作物前缀，用来把「水稻稻瘟病」拆成 作物=水稻 / 防治对象=稻瘟病
const CROPS = ['水稻','小麦','玉米','大豆','棉花','马铃薯','甘薯','花生','油菜','高粱','谷子','甘蔗','烟草','茶树','番茄','黄瓜','辣椒','茄子','白菜','甘蓝','萝卜','芹菜','菠菜','菜豆','豇豆','西瓜','甜瓜','南瓜','草莓','苹果','梨','桃','葡萄','柑橘','香蕉','芒果','荔枝','龙眼','猕猴桃','枣','樱桃','月季','牡丹','芍药','人参','枸杞','三七','当归','金银花','菊花','兰花','杜鹃','栀子']

// 病名里的作物线索：稻瘟病→水稻、棉铃虫→棉花…
const CROP_HINTS = [
  [/稻/, '水稻'], [/玉米/, '玉米'], [/小麦|麦/, '小麦'], [/棉/, '棉花'], [/马铃薯|土豆/, '马铃薯'],
  [/甘薯|红薯|地瓜/, '甘薯'], [/花生/, '花生'], [/大豆|黄豆/, '大豆'], [/油菜/, '油菜'],
  [/番茄|西红柿/, '番茄'], [/黄瓜/, '黄瓜'], [/辣椒/, '辣椒'], [/茄子/, '茄子'], [/白菜/, '白菜'],
  [/菜豆|豆角/, '菜豆'], [/高粱/, '高粱'], [/甘蔗/, '甘蔗'], [/烟草/, '烟草'], [/茶/, '茶树'],
  [/苹果/, '苹果'], [/梨/, '梨'], [/桃/, '桃'], [/葡萄/, '葡萄'], [/柑橘|柑|橙/, '柑橘'],
  [/香蕉/, '香蕉'], [/香蕉|芒果/, '香蕉'], [/月季|玫瑰/, '月季'], [/牡丹/, '牡丹'], [/芍药/, '芍药']
]

// 兜底组合：登记库里作物名有时不同（花卉/蔬菜/果树），对象也可能带病名全称
function extraCombos(name, crop) {
  const n = String(name || '').replace(/（.*?）/g, '').trim()
  const out = [
    { crop, target: n.replace(/病$/, '') },
    { crop, target: n },
    { crop: '花卉', target: n.replace(/病$/, '') },
    { crop: '观赏花卉', target: n.replace(/病$/, '') },
    { crop: '蔬菜', target: n.replace(/病$/, '') },
    { crop: '果树', target: n.replace(/病$/, '') }
  ]
  const seen = new Set()
  return out.filter((x) => x.crop && x.target && !seen.has(x.crop + '|' + x.target) && seen.add(x.crop + '|' + x.target))
}

function guessCropAndTarget(name, host) {
  const n = String(name || '').replace(/（.*?）/g, '').trim()
  const h = String(host || '').split(/[、,，]/)[0].trim()
  const out = []
  if (h) out.push({ crop: h, target: n })
  for (const c of CROPS) {
    if (n.startsWith(c) && n.length > c.length) out.push({ crop: c, target: n.slice(c.length) })
  }
  // 没有寄主、名字也不带作物前缀 → 按关键字猜
  if (!out.length) {
    for (const [re, crop] of CROP_HINTS) {
      if (re.test(n)) { out.push({ crop, target: n }); break }
    }
  }
  const seen = new Set()
  return out.filter((x) => x.crop && x.target && !seen.has(x.crop + '|' + x.target) && seen.add(x.crop + '|' + x.target))
}

let cookie = ''
async function getCookie() {
  if (cookie) return cookie
  const r = await fetch(BASE + 'queryselect.do', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
  await r.text()
  const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]
  cookie = (set || []).map((x) => String(x).split(';')[0]).filter(Boolean).join('; ')
  return cookie
}

// 查询：返回 [{ hash, 登记证号, 农药名称, 剂型, 含量, 毒性 }]
async function queryList(crop, target, pageSize = 20) {
  const ck = await getCookie()
  const fields = {
    pageNo: '1', pageSize: String(pageSize),
    djzh: '', nymc: '', cjmc: '', sf: '', nylb: '', zhl: '', jx: '',
    zwmc: crop, fzdx: target, syff: '', dx: '',
    yxcf: '', yxcf_en: '', yxcfhl: '', yxcf2: '', yxcf2_en: '', yxcf2hl: '', yxcf3: '', yxcf3_en: '', yxcf3hl: '',
    yxqs_start: '', yxqs_end: '', yxjz_start: '', yxjz_end: ''
  }
  const r = await fetch(BASE + 'queryselect.do', {
    method: 'POST',
    headers: { 'User-Agent': UA, cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + 'queryselect.do' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(25000)
  })
  const html = await r.text()
  const total = (html.match(/共\s*(\d+)\s*条/) || [])[1]
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1])
  const rows = []
  for (const tr of trs) {
    const hash = (tr.match(/_viewpd\('([a-f0-9]+)'\)/) || [])[1]
    if (!hash) continue
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => clean(m[1]))
    const djzh = (cells.join(' ').match(/PD\d+[-\d]*/) || [])[0] || ''
    rows.push({ hash, djzh, cells })
  }
  return { total: total ? parseInt(total, 10) : 0, rows }
}

// 详情：返回 { 登记证号, 农药名称, 剂型, 含量, 毒性, 类别, 用药: [{作物,对象,用量,方法}] }
async function fetchDetail(hash) {
  const ck = await getCookie()
  const r = await fetch(BASE + 'viewpd.do?r=' + Math.random() + '&id=' + hash, {
    headers: { 'User-Agent': UA, cookie: ck, Referer: BASE + 'queryselect.do' },
    signal: AbortSignal.timeout(25000)
  })
  const html = await r.text()
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
  // 字段提取：「标题：」后面跟 </td><td>值</td>
  const pick = (label) => {
    const re = new RegExp(label + '[：:]?\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>')
    const m = text.match(re)
    return m ? clean(m[1]) : ''
  }
  const info = {
    djzh: pick('登记证号'),
    name: pick('农药名称'),
    tox: pick('毒性'),
    form: pick('剂型'),
    content: pick('总有效成分含量'),
    kind: pick('农药类别'),
    usages: []
  }
  // 用药量表：在「制剂用药量信息」之后，每 4 个 td 一组
  const idx = text.indexOf('制剂用药量信息')
  if (idx >= 0) {
    const seg = text.slice(idx, idx + 6000)
    const tds = [...seg.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => clean(m[1]))
    const h = tds.findIndex((t) => t.indexOf('作物/场所') >= 0)
    const start = h >= 0 ? h + 4 : 0
    for (let i = start; i + 3 < tds.length; i += 4) {
      const crop = tds[i], target = tds[i + 1], dose = tds[i + 2], method = tds[i + 3]
      if (crop && /[\u4e00-\u9fa5]/.test(crop)) info.usages.push({ crop, target, dose, method })
    }
  }
  return info
}

async function main() {
  const all = await dbAll('SELECT id, name, host, medicines, verify_source FROM diseases ORDER BY id')
  let targets = all
  if (missingOnly) targets = all.filter((d) => !/农药登记/.test(String(d.verify_source || '')))
  if (refreshAll) targets = all   // 重新抓一遍，补齐新增字段（如毒性）
  if (only) targets = targets.filter((d) => d.name.indexOf(only) >= 0)
  targets = targets.slice(0, limit)

  console.log('待处理: ' + targets.length + ' 条病害' + (dryRun ? '（预演，不写库）' : ''))
  let okCount = 0, missCount = 0

  for (const d of targets) {
    const combos = guessCropAndTarget(d.name, d.host)
    if (!combos.length) console.log('   ' + d.name + '：没有作物线索，按通用虫害处理');

    let found = null
    const tries = []
    for (const c of combos) tries.push(c)
    if (combos.length) extraCombos(d.name, combos[0].crop).forEach((c) => tries.push(c))

    for (const c of tries) {
      try {
        const { total, rows } = await queryList(c.crop, c.target)
        if (rows.length) { found = { ...c, total, rows }; break }
        console.log('   ' + d.name + ' ← 查询「' + c.crop + ' / ' + c.target + '」共 ' + total + ' 条');
      } catch (e) { console.log('   查询失败: ' + e.message) }
      await sleep(600)
    }

    // 通用虫害（蚜虫、红蜘蛛…）没有作物线索：挨个试主要作物
    if (!found && !combos.length) {
      for (const crop of ['小麦', '棉花', '水稻', '蔬菜', '柑橘', '苹果']) {
        try {
          const { total, rows } = await queryList(crop, d.name)
          if (rows.length) { found = { crop, target: d.name, total, rows }; break }
        } catch (e) {}
        await sleep(500)
      }
    }

    if (!found) { console.log('\n⏭ ' + d.name + '：农药登记库里没匹配到' + (combos[0] ? '（作物=' + combos[0].crop + '）' : '')); missCount++; continue }

    // 取不同农药名称的前 3 个
    const picked = []
    const seen = new Set()
    for (const row of found.rows) {
      // 列表列顺序：登记证号 / 农药名称 / 类别 / 剂型 / 含量 / 有效期 / 持有人
      const nymc = row.cells[1] || ''
      const key = nymc || row.djzh
      if (!key || seen.has(key)) continue
      seen.add(key)
      picked.push(row)
      if (picked.length >= 3) break
    }

    const meds = []
    for (const row of picked) {
      try {
        const info = await fetchDetail(row.hash)
        const use = info.usages.find((u) => u.target && u.target.indexOf(found.target.slice(-4)) >= 0) || info.usages[0]
        if (!info.name) continue
        const label = info.name + (info.content ? ' ' + info.content : '') + (info.form ? ' ' + info.form : '')
        const usage = use
          ? (use.dose || '') + (use.method ? ' · ' + use.method : '') + '（登记证 ' + (info.djzh || row.djzh) + '）'
          : '（登记证 ' + (info.djzh || row.djzh) + '）'
        meds.push({ name: label.trim(), usage: usage.trim(), tox: info.tox || '' })
      } catch (e) { console.log('   详情失败: ' + e.message) }
      await sleep(700)
    }

    if (!meds.length) { console.log('\n⏭ ' + d.name + '：抓到列表但没取到详情'); missCount++; continue }

    console.log('\n✅ ' + d.name + '（' + found.crop + ' / ' + found.target + '，登记 ' + found.total + ' 条）')
    meds.forEach((m) => console.log('   · ' + m.name + '  →  ' + m.usage))

    if (!dryRun) {
      await dbRun(
        // 只更新用药信息和来源说明：不动 verified，也不写 verify_date。
        // verify_date 的语义是"人工核实日期"，导入不是核实——
        // 以前顺手写了日期，导致 71 条待核实记录看起来像核实过（2026-11-05 修正）。
        'UPDATE diseases SET medicines = ?, verify_source = ? WHERE id = ?',
        [JSON.stringify(meds),
         '中国农药信息网 农药登记数据（' + found.crop + '/' + found.target + '）',
         d.id]
      )
    }
    okCount++
    await sleep(800)
  }

  console.log('\n============ 结果 ============')
  console.log('更新 ' + okCount + ' 条 / 未匹配 ' + missCount + (dryRun ? '（预演）' : ''))
  if (!dryRun) console.log('后台查看: http://localhost:3000/admin/diseases')
}

main().catch((e) => { console.error('脚本异常：', e); process.exit(1) })
