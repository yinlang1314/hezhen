<template>
  <!-- ============ 未登录：企业级登录页（左品牌 / 右表单） ============ -->
  <div v-if="!token" class="login-page">
    <section class="login-brand">
      <div class="brand-mark">禾</div>
      <h1>禾诊 · 病虫害数据平台</h1>
      <p class="brand-sub">Knowledge · Recognition · Early Warning</p>
      <ul class="brand-points">
        <li><span>01</span>知识库共 249 条，人工复核后上线</li>
        <li><span>02</span>AI 识别 + 天气风险预警联动</li>
        <li><span>03</span>数据看板需管理员权限访问</li>
      </ul>
      <div class="brand-foot">© 2026 禾诊 · 农业智能防治系统</div>
    </section>

    <section class="login-form-wrap">
      <div class="login-form">
        <h2>登录数据看板</h2>
        <p class="login-hint">使用管理员账号登录（与 App / 后台同一套账号）</p>
        <el-form label-position="top" @submit.prevent="doLogin">
          <el-form-item label="账号">
            <el-input v-model="username" size="large" placeholder="请输入管理员账号" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="password" type="password" size="large" show-password placeholder="请输入密码" @keyup.enter="doLogin" />
          </el-form-item>
          <el-button type="primary" size="large" class="login-btn" :loading="logging" @click="doLogin">登 录</el-button>
        </el-form>
        <div class="login-tip">非管理员账号会被拒绝访问</div>
      </div>
    </section>
  </div>

  <!-- ============ 已登录：左侧栏 + 顶栏 + 工作区 ============ -->
  <div v-else :class="['layout', { collapsed }]">
    <aside class="aside">
      <div class="aside-logo">
        <span class="mark">禾</span>
        <span class="logo-text" v-show="!collapsed">禾诊数据平台</span>
        <button class="collapse-btn" :title="collapsed ? '展开侧栏' : '收起侧栏'" @click="toggleCollapse">
          {{ collapsed ? '»' : '«' }}
        </button>
      </div>
      <nav class="aside-nav">
        <div class="nav-group">分析</div>
        <a :class="['nav-item', { on: menu === 'overview' }]" @click="menu = 'overview'">
          <span class="nav-ico">◎</span><span v-show="!collapsed">运营总览</span>
        </a>
        <a :class="['nav-item', { on: menu === 'diseases' }]" @click="switchMenu('diseases')">
          <span class="nav-ico">▤</span><span v-show="!collapsed">病虫害库</span>
        </a>
        <a :class="['nav-item', { on: menu === 'risk' }]" @click="switchMenu('risk')">
          <span class="nav-ico">◈</span><span v-show="!collapsed">风险联动</span>
        </a>
        <div class="nav-group">系统</div>
        <a class="nav-item" href="http://localhost:3000/admin" target="_blank">
          <span class="nav-ico">↗</span><span v-show="!collapsed">管理后台</span>
        </a>
      </nav>
      <div class="aside-user">
        <div class="avatar">{{ (who || 'A').slice(0, 1).toUpperCase() }}</div>
        <div class="user-meta" v-show="!collapsed">
          <div class="user-name">{{ who }}</div>
          <div class="user-role">管理员</div>
        </div>
        <a class="logout" v-show="!collapsed" @click="logout">退出</a>
      </div>
    </aside>

    <div class="main">
      <header class="header">
        <div class="crumb">
          <a class="crumb-link" @click="switchMenu('overview')">数据看板</a>
          <i>/</i>
          <span class="crumb-cur">{{ menu === 'overview' ? '运营总览' : menu === 'diseases' ? '病虫害库' : '风险联动' }}</span>
        </div>
        <div class="header-right">
          <span class="updated" v-if="lastUpdated">更新于 {{ lastUpdated }}</span>
          <el-button size="small" :loading="exporting" @click="exportImage">导出图片</el-button>
          <el-button size="small" :loading="loading" @click="loadAll">刷新数据</el-button>
        </div>
      </header>

      <main class="workspace">
        <!-- ===== 运营总览 ===== -->
        <template v-if="menu === 'overview'">
          <div class="kpi-grid">
            <div class="kpi" v-for="c in cards" :key="c.key">
              <div class="kpi-top">
                <span class="kpi-label">{{ c.label }}</span>
                <span class="kpi-dot" :style="{ background: c.color }"></span>
              </div>
              <div class="kpi-value">{{ stats[c.key] ?? '-' }}<small>{{ c.unit }}</small></div>
              <div class="kpi-foot">
                <span>{{ c.hint }}</span>
                <em v-if="c.key === 'histories' && trendDelta !== null"
                    :class="trendDelta >= 0 ? 'up' : 'down'">
                  {{ trendDelta >= 0 ? '▲' : '▼' }} {{ Math.abs(trendDelta) }} 较前 7 天
                </em>
              </div>
            </div>
          </div>

          <div class="grid-2">
            <section class="panel">
              <header class="panel-head">
                <div>
                  <h3>识别量趋势</h3>
                  <p>最近 30 天 · 共 {{ trendTotal }} 次</p>
                </div>
                <el-radio-group v-model="trendDays" size="small" @change="loadTrend">
                  <el-radio-button :value="7">7 天</el-radio-button>
                  <el-radio-button :value="30">30 天</el-radio-button>
                </el-radio-group>
              </header>
              <div ref="trendBox" class="chart-lg"></div>
            </section>

            <section class="panel">
              <header class="panel-head">
                <div>
                  <h3>病害分类构成</h3>
                  <p>按知识条数统计</p>
                </div>
              </header>
              <div ref="pieBox" class="chart-lg"></div>
            </section>
          </div>

          <div class="grid-2">
            <section class="panel">
              <header class="panel-head">
                <div>
                  <h3>危害等级分布</h3>
                  <p>知识库条目按等级统计</p>
                </div>
              </header>
              <div ref="levelBox" class="chart-md"></div>
            </section>

            <section class="panel">
              <header class="panel-head">
                <div>
                  <h3>识别 TOP 10</h3>
                  <p>按识别次数排序</p>
                </div>
                <el-input v-model="topKeyword" size="small" placeholder="筛选病害" style="width:150px" clearable />
              </header>
              <el-table :data="filteredTop" size="small" height="264" stripe>
                <el-table-column type="index" width="48" label="#" />
                <el-table-column prop="name" label="病害名称" min-width="170" show-overflow-tooltip />
                <el-table-column prop="times" label="次数" width="80" align="right" />
                <el-table-column prop="lastTime" label="最近识别" width="160" align="right" />
              </el-table>
            </section>
          </div>
        </template>

        <!-- ===== 风险联动（天气风险 × 实际识别） ===== -->
        <template v-if="menu === 'risk'">
          <div class="risk-topbar">
            <div class="risk-intro">
              <h3>天气风险 × 识别数据</h3>
              <p>用真实天气预报算出未来 3 天风险，并对照最近 30 天实际识别量，判断预警是否落到了真问题上</p>
            </div>
            <div class="risk-controls">
              <el-select v-model="riskRegion" size="small" style="width:130px" @change="loadRisk">
                <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
              </el-select>
              <el-button size="small" :loading="riskLoading" @click="loadRisk">刷新</el-button>
            </div>
          </div>

          <div class="risk-days" v-if="riskData">
            <div class="risk-day" v-for="d in riskData.days" :key="d.date">
              <div class="rd-date">{{ d.date.slice(5) }}</div>
              <div class="rd-weather">{{ d.tmean }}℃ · 湿度 {{ d.humidity }}% · 雨 {{ d.rain }}mm</div>
              <div class="rd-count"><b>{{ d.count }}</b> 条风险</div>
            </div>
          </div>

          <div class="grid-2 risk-grid">
            <section class="panel">
              <header class="panel-head">
                <div>
                  <h3>风险病害 × 近 30 天识别量</h3>
                  <p>{{ riskRegion }} · 越靠右上 = 天气风险高且确实被识别到</p>
                </div>
              </header>
              <div ref="riskScatter" class="chart-lg"></div>
            </section>

            <section class="panel">
              <header class="panel-head">
                <div>
                  <h3>联动清单</h3>
                  <p>按风险分排序，附识别次数</p>
                </div>
              </header>
              <el-table :data="riskRows" size="small" height="300" stripe>
                <el-table-column prop="name" label="病害" min-width="150" show-overflow-tooltip />
                <el-table-column label="风险" width="96">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.level === 3 ? 'danger' : row.level === 2 ? 'warning' : 'success'" effect="plain">
                      {{ row.levelText }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="score" label="分数" width="72" align="right" />
                <el-table-column prop="recentCount" label="近30天识别" width="100" align="right" />
              </el-table>
            </section>
          </div>

          <section class="panel" v-if="riskData && riskData.recognizedOnly.length">
            <header class="panel-head">
              <div>
                <h3>有识别但当前未达风险阈值</h3>
                <p>可能是季节已过、或规则暂未覆盖 —— 值得补充规则</p>
              </div>
            </header>
            <div class="ro-list">
              <span class="ro-item" v-for="x in riskData.recognizedOnly" :key="x.name">
                {{ x.name }} <em>{{ x.recentCount }} 次</em>
              </span>
            </div>
          </section>
        </template>

        <!-- ===== 病虫害库（ProTable） ===== -->
        <template v-else>
          <ProTable
            title="病虫害知识库"
            :columns="tableColumns"
            :data="rows"
            :total="tableTotal"
            :loading="tableLoading"
            :page="tablePage"
            :page-size="tablePageSize"
            search-placeholder="搜索名称 / 分类"
            :filters="[
              { label: '全部状态', value: 'all' },
              { label: '已核实', value: '1' },
              { label: '待核实', value: '0' }
            ]"
            export-url="/api/dashboard/export/diseases.csv"
            storage-key="pro-table-disease-columns"
            :height="560"
            @search="onTableSearch"
            @refresh="loadTable"
            @update:page="(p) => { tablePage = p; loadTable() }"
            @update:page-size="(s) => { tablePageSize = s; tablePage = 1; loadTable() }"
          />
        </template>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { login, getToken, setToken, clearToken, overview, trend, distribution, top, diseases, riskAnalysis } from './api.js'
import ProTable from './components/ProTable.vue'

const token = ref(getToken())
const username = ref('')
const password = ref('')
const logging = ref(false)
const loading = ref(false)
const who = ref(localStorage.getItem('dash_user') || 'admin')
const menu = ref('overview')
const lastUpdated = ref('')
const collapsed = ref(false)          // 侧栏折叠
const exporting = ref(false)          // 导出图片中

const stats = ref({})
const trendItems = ref([])
const trendDays = ref(30)
const dist = ref({ category: [], level: [], verified: [] })
const topList = ref([])
const topKeyword = ref('')

// ===== 风险联动 =====
const riskRegion = ref('江西省')
const regions = ['江西省', '广东省', '湖南省', '福建省', '浙江省']
const riskLoading = ref(false)
const riskData = ref(null)
const riskScatter = ref(null)
const riskRows = computed(() => (riskData.value && riskData.value.items) || [])

const rows = ref([])
const tableTotal = ref(0)
const tableLoading = ref(false)
const tablePage = ref(1)
const tablePageSize = ref(10)
const tableQuery = ref({ keyword: '', filter: 'all' })
const tableColumns = [
  { prop: 'id', label: 'ID', width: 76 },
  { prop: 'name', label: '病害名称', minWidth: 220 },
  { prop: 'category', label: '分类', minWidth: 170 },
  { prop: 'type', label: '类型', minWidth: 130 },
  { prop: 'levelText', label: '危害等级', width: 110 },
  { prop: 'verified', label: '状态', width: 100, type: 'boolean' },
  { prop: 'source', label: '数据来源', minWidth: 240 },
  { prop: 'medCount', label: '用药', width: 84, align: 'right' },
  { prop: 'verifyDate', label: '核对日期', width: 120 }
]

const trendBox = ref(null)
const pieBox = ref(null)
const levelBox = ref(null)
let charts = []

const cards = [
  { key: 'diseases', label: '知识库条目', unit: ' 条', hint: '包含待核实草稿', color: '#0f766e' },
  { key: 'verified', label: '已核实上线', unit: ' 条', hint: 'App 内可见', color: '#047857' },
  { key: 'users', label: '注册用户', unit: ' 人', hint: '含微信登录用户', color: '#1d4ed8' },
  { key: 'histories', label: '累计识别', unit: ' 次', hint: '全部用户识别记录', color: '#6d28d9' },
  { key: 'correctionsPending', label: '待复核纠错', unit: ' 条', hint: '需人工判断', color: '#b45309' },
  { key: 'wxUsers', label: '微信登录用户', unit: ' 人', hint: '小程序一键登录', color: '#047857' },
  { key: 'feedback', label: '意见反馈', unit: ' 条', hint: '用户提交', color: '#0e7490' },
  { key: 'collections', label: '用户收藏', unit: ' 条', hint: '收藏的病害条目', color: '#be185d' }
]

const trendTotal = computed(() => trendItems.value.reduce((s, x) => s + (x.count || 0), 0))
// 近 7 天 vs 前 7 天，用于 KPI 的趋势提示
const trendDelta = computed(() => {
  const items = trendItems.value
  if (items.length < 14) return null
  const last7 = items.slice(-7).reduce((s, x) => s + (x.count || 0), 0)
  const prev7 = items.slice(-14, -7).reduce((s, x) => s + (x.count || 0), 0)
  return last7 - prev7
})
const filteredTop = computed(() => {
  const k = topKeyword.value.trim()
  return k ? topList.value.filter((x) => String(x.name).includes(k)) : topList.value
})

async function doLogin() {
  if (!username.value || !password.value) return ElMessage.warning('请填写账号和密码')
  logging.value = true
  try {
    const data = await login(username.value, password.value)
    if (!data.userInfo || !data.userInfo.isAdmin) {
      ElMessage.error('该账号没有管理员权限')
      return
    }
    setToken(data.token)
    localStorage.setItem('dash_user', data.userInfo.username || 'admin')
    who.value = data.userInfo.username || 'admin'
    token.value = data.token
    await nextTick()
    await loadAll()
    await loadTable()
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    logging.value = false
  }
}

function logout() {
  clearToken()
  token.value = ''
  charts.forEach((c) => c && c.dispose())
  charts = []
}

async function loadTrend() {
  try {
    const t = await trend(trendDays.value)
    trendItems.value = (t && t.items) || []
    await nextTick()
    renderCharts()
  } catch (e) { /* 由 loadAll 统一提示 */ }
}

async function loadAll() {
  loading.value = true
  try {
    const [o, t, d, tp] = await Promise.all([overview(), trend(trendDays.value), distribution(), top(10)])
    stats.value = o || {}
    trendItems.value = (t && t.items) || []
    dist.value = d || { category: [], level: [], verified: [] }
    topList.value = tp || []
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    await nextTick()
    renderCharts()
  } catch (e) {
    if (/登录已过期/.test(e.message)) { logout(); ElMessage.error('登录已过期，请重新登录') }
    else ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 拉取风险联动数据并画散点图
async function loadRisk() {
  riskLoading.value = true
  try {
    riskData.value = await riskAnalysis(riskRegion.value)
    await nextTick()
    renderRiskChart()
  } catch (e) {
    ElMessage.error(e.message || '风险数据加载失败')
  } finally {
    riskLoading.value = false
  }
}

function renderRiskChart() {
  if (!riskScatter.value || !riskData.value) return
  const items = riskData.value.items || []
  const chart = echarts.init(riskScatter.value)
  const colorOf = (level) => (level === 3 ? '#b91c1c' : level === 2 ? '#b45309' : '#047857')

  chart.setOption({
    grid: { left: 56, right: 24, top: 24, bottom: 40 },
    tooltip: {
      formatter: (p) => {
        const d = items[p.dataIndex]
        return d.name + '<br/>风险分 ' + d.score + '（' + d.levelText + '）<br/>近 30 天识别 ' + d.recentCount + ' 次'
      }
    },
    xAxis: {
      type: 'value', name: '近 30 天识别次数', nameLocation: 'middle', nameGap: 26,
      nameTextStyle: { fontSize: 11, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { fontSize: 11, color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      min: 0
    },
    yAxis: {
      type: 'value', name: '风险分', nameTextStyle: { fontSize: 11, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { fontSize: 11, color: '#64748b' },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      min: 0, max: 100
    },
    series: [{
      type: 'scatter',
      symbolSize: (val, p2) => 14 + Math.min(16, items[p2.dataIndex].recentCount * 3),
      // 识别次数是整数，很多点会重合在 x=0；按序号加一点点偏移，视觉上才分得开
      data: items.map((x, i) => ({
        value: [x.recentCount + (i % 3) * 0.06, x.score],
        itemStyle: { color: colorOf(x.level), opacity: .85, borderColor: '#fff', borderWidth: 1.5 }
      })),
      label: {
        show: true, position: 'top', fontSize: 10, color: '#475569',
        formatter: (p) => (items[p.dataIndex].recentCount > 0 ? items[p.dataIndex].name : '')
      },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' }
    }]
  })
  charts.push(chart)
}

async function loadTable() {
  tableLoading.value = true
  try {
    const data = await diseases({
      page: tablePage.value,
      pageSize: tablePageSize.value,
      keyword: tableQuery.value.keyword,
      verified: tableQuery.value.filter === 'all' ? '' : tableQuery.value.filter
    })
    rows.value = data.list || []
    tableTotal.value = data.total || 0
  } catch (e) {
    ElMessage.error(e.message || '加载表格失败')
  } finally {
    tableLoading.value = false
  }
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem('dash_collapsed', collapsed.value ? '1' : '0')
  // 折叠会改变图表容器宽度，重排一下
  setTimeout(resizeAll, 260)
}

function switchMenu(key) {
  menu.value = key
  if (key === 'diseases' && !rows.value.length) loadTable()
  if (key === 'risk' && !riskData.value) loadRisk()
}

// 导出当前工作区为 PNG（答辩贴 PPT / 发群都方便）
async function exportImage() {
  if (exporting.value) return
  exporting.value = true
  const el = document.querySelector('.workspace')
  const prevBg = el ? el.style.background : ''
  try {
    const { default: html2canvas } = await import('html2canvas')
    if (el) el.style.background = '#f1f5f9'   // 截图时补上底色，避免透明
    const canvas = await html2canvas(el, {
      backgroundColor: '#f1f5f9',
      scale: 2,                 // 2 倍图，贴 PPT 不糊
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY
    })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = '禾诊数据看板-' + stamp + '.png'
    a.click()
    ElMessage.success('截图已下载')
  } catch (e) {
    ElMessage.error('导出失败：' + (e.message || e))
  } finally {
    if (el) el.style.background = prevBg
    exporting.value = false
  }
}

function onTableSearch({ keyword, filter }) {
  tableQuery.value = { keyword, filter }
  tablePage.value = 1
  loadTable()
}

const PALETTE = ['#0f766e', '#0e7490', '#1d4ed8', '#6d28d9', '#b45309', '#be185d', '#047857', '#475569']

function renderCharts() {
  if (!trendBox.value || !pieBox.value || !levelBox.value) return
  charts.forEach((c) => c && c.dispose())
  charts = []

  const baseText = { color: '#64748b', fontSize: 11 }
  const axisLine = { lineStyle: { color: '#e2e8f0' } }
  const splitLine = { lineStyle: { color: '#f1f5f9' } }

  const trendChart = echarts.init(trendBox.value)
  trendChart.setOption({
    grid: { left: 44, right: 18, top: 18, bottom: 28 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    xAxis: { type: 'category', data: trendItems.value.map((x) => x.date), axisLine, axisLabel: baseText, axisTick: { show: false } },
    yAxis: { type: 'value', axisLine: { show: false }, axisLabel: baseText, splitLine, axisTick: { show: false } },
    series: [{
      type: 'line', smooth: 0.3, showSymbol: false,
      data: trendItems.value.map((x) => x.count),
      lineStyle: { width: 2, color: '#0f766e' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(15,118,110,.28)' },
          { offset: 1, color: 'rgba(15,118,110,.01)' }
        ])
      }
    }]
  })

  const pieChart = echarts.init(pieBox.value)
  pieChart.setOption({
    color: PALETTE,
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 条（{d}%）' },
    legend: { type: 'scroll', bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: baseText },
    series: [{
      type: 'pie', radius: ['46%', '68%'], center: ['50%', '42%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: (dist.value.category || []).map((x) => ({ name: String(x.name).replace(/（[^）]*）/g, '').trim(), value: x.value }))
    }]
  })

  const levelChart = echarts.init(levelBox.value)
  levelChart.setOption({
    color: PALETTE,
    grid: { left: 76, right: 24, top: 12, bottom: 20 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', axisLine: { show: false }, axisLabel: baseText, splitLine, axisTick: { show: false } },
    yAxis: { type: 'category', data: (dist.value.level || []).map((x) => x.name), axisLine, axisLabel: baseText, axisTick: { show: false } },
    series: [{
      type: 'bar', barWidth: 16,
      data: (dist.value.level || []).map((x, i) => ({ value: x.value, itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 3, 3, 0] } }))
    }]
  })

  charts = [trendChart, pieChart, levelChart]
  window.addEventListener('resize', resizeAll)
}

function resizeAll() { charts.forEach((c) => c && c.resize()) }

watch(menu, (v) => {
  if (v === 'overview') nextTick(renderCharts)
  if (v === 'risk' && riskData.value) nextTick(renderRiskChart)
})

onMounted(async () => {
  const saved = localStorage.getItem('dash_collapsed')
  collapsed.value = saved === '1' || window.innerWidth < 1100
  window.addEventListener('resize', autoCollapse)
  if (token.value) { await loadAll(); await loadTable() }
})

// 窗口宽度变化：窄屏自动折叠（手动状态优先保存过的不覆盖）
function autoCollapse() {
  if (window.innerWidth < 1100) collapsed.value = true
  else if (localStorage.getItem('dash_collapsed') !== '1') collapsed.value = false
  setTimeout(resizeAll, 260)
}
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAll)
  window.removeEventListener('resize', autoCollapse)
})
</script>

<style scoped>
/* ================= 登录页 ================= */
.login-page { display: flex; height: 100vh; }
.login-brand {
  width: 46%; min-width: 420px; padding: 56px 52px;
  background: linear-gradient(150deg, #0f172a 0%, #134e4a 100%);
  color: #e2e8f0; display: flex; flex-direction: column; position: relative; overflow: hidden;
}
.login-brand::after {
  content: ''; position: absolute; right: -120px; bottom: -120px;
  width: 340px; height: 340px; border-radius: 50%;
  background: rgba(20, 184, 166, .12);
}
.brand-mark {
  width: 42px; height: 42px; border-radius: 8px; background: #0f766e;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #fff; font-size: 20px;
}
.login-brand h1 { font-size: 28px; margin: 26px 0 8px; color: #f8fafc; font-weight: 600; letter-spacing: .5px; }
.brand-sub { color: #94a3b8; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; }
.brand-points { list-style: none; padding: 0; margin: 40px 0 0; }
.brand-points li { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(148, 163, 184, .18); font-size: 13px; color: #cbd5e1; }
.brand-points span { color: #2dd4bf; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
.brand-foot { margin-top: auto; font-size: 11px; color: #64748b; }
.login-form-wrap { flex: 1; display: flex; align-items: center; justify-content: center; background: #f8fafc; }
.login-form { width: 340px; }
.login-form h2 { font-size: 22px; color: #0f172a; margin: 0 0 6px; }
.login-hint { font-size: 12px; color: #94a3b8; margin: 0 0 26px; }
.login-btn { width: 100%; margin-top: 8px; }
.login-tip { margin-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; }

/* ================= 主框架 ================= */
.layout { display: flex; height: 100vh; }
.layout.collapsed .aside { width: 64px; }
.layout.collapsed .aside-logo { justify-content: center; padding: 0 8px 16px; }
.layout.collapsed .collapse-btn { position: absolute; right: -10px; bottom: -10px; z-index: 2; }
.layout.collapsed .nav-group { text-align: center; padding: 10px 0 4px; font-size: 10px; }
.layout.collapsed .nav-item { justify-content: center; padding: 10px 0; }
.layout.collapsed .aside-user { justify-content: center; padding: 12px 4px 4px; }
.aside { transition: width .22s ease; }

.aside {
  width: 216px; flex-shrink: 0; background: var(--aside); color: #cbd5e1;
  display: flex; flex-direction: column; padding: 18px 0 12px;
}
.aside-logo { display: flex; align-items: center; gap: 10px; padding: 0 14px 16px; border-bottom: 1px solid #1e293b; position: relative; }
.collapse-btn {
  margin-left: auto; width: 22px; height: 22px; border-radius: 4px; cursor: pointer;
  background: #1e293b; color: #94a3b8; border: 1px solid #334155; font-size: 12px; line-height: 1;
}
.collapse-btn:hover { color: #e2e8f0; border-color: #475569; }
.aside-logo .mark {
  width: 28px; height: 28px; border-radius: 6px; background: #0f766e; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700;
}
.logo-text { font-size: 14px; font-weight: 600; color: #f1f5f9; letter-spacing: .5px; }
.aside-nav { flex: 1; padding: 14px 10px; }
.nav-group { font-size: 11px; color: #64748b; letter-spacing: 1px; padding: 10px 10px 6px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 6px;
  font-size: 13px; color: #cbd5e1; cursor: pointer; text-decoration: none; margin-bottom: 2px;
  transition: background .15s, color .15s;
}
.nav-item:hover { background: var(--aside-hover); color: #fff; }
.nav-item.on { background: #0f766e; color: #fff; }
.nav-ico { width: 16px; text-align: center; font-size: 13px; opacity: .9; }
.aside-user { display: flex; align-items: center; gap: 8px; padding: 12px 14px 4px; border-top: 1px solid #1e293b; }
.avatar { width: 30px; height: 30px; border-radius: 6px; background: #1e293b; color: #5eead4; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.user-meta { flex: 1; line-height: 1.3; }
.user-name { font-size: 12.5px; color: #e2e8f0; }
.user-role { font-size: 11px; color: #64748b; }
.logout { font-size: 12px; color: #94a3b8; cursor: pointer; }
.logout:hover { color: #fca5a5; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.header {
  height: 52px; background: #fff; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
}
.crumb { font-size: 12.5px; color: #94a3b8; display: flex; gap: 8px; align-items: center; }
.crumb i { font-style: normal; color: #cbd5e1; }
.crumb-link { color: #94a3b8; cursor: pointer; text-decoration: none; }
.crumb-link:hover { color: #0f766e; }
.crumb-cur { color: #0f172a; font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 12px; }
.updated { font-size: 12px; color: #94a3b8; }

.workspace { flex: 1; overflow: auto; padding: 16px 20px 32px; }

/* ================= KPI ================= */
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.kpi { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.kpi-top { display: flex; align-items: center; justify-content: space-between; }
.kpi-label { font-size: 12px; color: #64748b; }
.kpi-dot { width: 7px; height: 7px; border-radius: 50%; }
.kpi-value { font-size: 26px; font-weight: 600; color: #0f172a; margin: 8px 0 6px; letter-spacing: -.5px; }
.kpi-value small { font-size: 12px; font-weight: 400; color: #94a3b8; margin-left: 4px; }
.kpi-foot { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #94a3b8; }
.kpi-foot em { font-style: normal; font-size: 11px; }
.kpi-foot .up { color: #b45309; }
.kpi-foot .down { color: #047857; }

/* ================= 风险联动 ================= */
.risk-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.risk-intro h3 { margin: 0; font-size: 15px; color: #0f172a; }
.risk-intro p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; max-width: 720px; line-height: 1.6; }
.risk-controls { display: flex; gap: 8px; }
.risk-days { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; }
.risk-day { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.rd-date { font-size: 12px; color: #94a3b8; }
.rd-weather { font-size: 13px; color: #0f172a; margin: 6px 0 4px; }
.rd-count { font-size: 12px; color: #64748b; }
.rd-count b { color: #0f766e; font-size: 15px; }
.risk-grid { grid-template-columns: 1.5fr 1fr; }
.ro-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0 12px; }
.ro-item {
  font-size: 12px; color: #475569; background: #f1f5f9; border-radius: 4px; padding: 5px 10px;
}
.ro-item em { font-style: normal; color: #94a3b8; margin-left: 4px; }

/* ================= 面板 ================= */
.grid-2 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 12px; margin-top: 12px; }
.grid-2:last-child { grid-template-columns: 1fr 1fr; }
.panel { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px 8px; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.panel-head h3 { font-size: 13.5px; font-weight: 600; color: #0f172a; margin: 0; }
.panel-head p { font-size: 11.5px; color: #94a3b8; margin: 3px 0 0; }
.chart-lg { height: 288px; }
.chart-md { height: 264px; }

@media (max-width: 1200px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-2, .grid-2:last-child { grid-template-columns: 1fr; }
}
</style>
