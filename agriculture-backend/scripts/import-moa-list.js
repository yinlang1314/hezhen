#!/usr/bin/env node
/**
 * 导入农业农村部病虫害名录（NY/T 2024 征求意见稿，293 条）
 *
 *   node scripts/import-moa-list.js --dry-run
 *   node scripts/import-moa-list.js
 *
 * 导入的条目全部是「待核实」(verified=0)，不会出现在 App 里，
 * 需要你在后台逐条确认（补症状/来源）后点「核实」才上线。
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { dbRun, dbAll } = require('../config/db')
const router = require('../routes/disease')
const { sameDisease, cleanDiseaseName } = router.__helpers

const dryRun = process.argv.includes('--dry-run')
const LIST = path.join(__dirname, 'data', 'moa-pest-list.json')

// 从名称前缀猜寄主
const CROPS = ['小麦','水稻','稻','玉米','马铃薯','油菜','大豆','棉花','花生','番茄','黄瓜','辣椒','茄子','白菜','甘蓝','萝卜','芹菜','菠菜','豇豆','菜豆','瓜类','十字花科','蔬菜','苹果','梨','桃','葡萄','柑橘','香蕉','荔枝','龙眼','芒果','猕猴桃','枣','樱桃','茶树','烟草','甘蔗','高粱','甘薯','荞麦','月季','牡丹','芍药','花卉','枸杞','人参','橡胶','甜菜','向日葵','芝麻','亚麻','大麦','燕麦','谷子','糜子','绿豆','豌豆','蚕豆','草莓','西瓜','甜瓜','南瓜']

function guessHost(name) {
  for (const c of CROPS) {
    if (name.startsWith(c)) return c === '稻' ? '水稻' : c
  }
  return ''
}

async function main() {
  if (!fs.existsSync(LIST)) { console.error('缺少名录文件: ' + LIST); process.exit(1) }
  const items = JSON.parse(fs.readFileSync(LIST, 'utf8'))
  const existing = await dbAll('SELECT id, name FROM diseases')
  let added = 0, skipped = 0

  for (const it of items) {
    const name = cleanDiseaseName(it.name)
    if (!name) { skipped++; continue }
    // 鼠害不是作物病害识别对象，跳过
    if (/鼠/.test(name)) { skipped++; continue }
    if (existing.some((row) => sameDisease(name, row.name))) { skipped++; continue }

    const host = guessHost(name)
    const category = '部名录·' + (it.level.indexOf('一类') === 0 ? '一类' : it.level.indexOf('二类') === 0 ? '二类' : '其他')

    if (dryRun) {
      console.log('会新增 ' + name + '（' + category + (host ? ' · 寄主 ' + host : '') + '）')
      added++
      continue
    }

    await dbRun(
      `INSERT INTO diseases (name, type, category, level, level_text, image, host, verified, verify_source, verify_date,
        symptom, cause, spread, occurrence, medicines, suggestions, prevention)
       VALUES (?, ?, ?, 2, '中度危害', '', ?, 0, ?, '', '', '', '', '', '[]', '[]', '[]')`,
      [name, host ? host + '病害' : '部名录', category, host,
       '农业农村部 NY/T《农作物病虫害监测数据规范》名录（编码 ' + it.code + '）']
    )
    console.log('✅ ' + name + '（' + category + '）')
    added++
  }

  console.log('\n============ 结果 ============')
  console.log((dryRun ? '会新增 ' : '新增 ') + added + ' 条 / 跳过 ' + skipped + ' 条（已存在）')
  if (!dryRun) {
    console.log('\n⚠️ 全部是「待核实」，App 里看不到。')
    console.log('   后台审核: http://localhost:3000/admin/diseases')
    console.log('   补用药: node scripts/fetch-registry.js --missing')
  }
}

main().catch((e) => { console.error('导入失败：', e); process.exit(1) })
