<template>
  <!-- 未登录：先登录（管理员账号） -->
  <div v-if="!token" class="login-wrap">
    <el-card class="login-card" shadow="always">
      <div class="login-head">
        <div class="logo">禾</div>
        <div>
          <div class="login-title">禾诊 · 数据看板</div>
          <div class="login-sub">Vue 3 + Element Plus + ECharts</div>
        </div>
      </div>
      <el-form @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="username" placeholder="管理员账号" size="large" clearable />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="密码" size="large" show-password @keyup.enter="doLogin" />
        </el-form-item>
        <el-button type="success" size="large" :loading="logging" style="width:100%" @click="doLogin">
          登录看板
        </el-button>
      </el-form>
      <div class="login-tip">只允许管理员账号登录（和 App 账号同一套）</div>
    </el-card>
  </div>

  <!-- 已登录：看板 -->
  <div v-else class="page">
    <header class="topbar">
      <div class="brand"><span class="dot"></span> 禾诊 · 数据看板</div>
      <div class="top-right">
        <span class="who">{{ who }}</span>
        <el-button size="small" :loading="loading" @click="loadAll">刷新</el-button>
        <el-button size="small" type="danger" plain @click="logout">退出</el-button>
      </div>
    </header>

    <main class="content">
      <el-tabs v-model="activeTab" class="main-tabs">
        <el-tab-pane label="总览" name="overview" />
        <el-tab-pane label="病虫害库" name="diseases" />
      </el-tabs>

      <!-- ===== 总览 ===== -->
      <template v-if="activeTab === 'overview'">
      <!-- 指标卡 -->
      <el-row :gutter="16">
        <el-col :xs="12" :sm="8" :md="6" v-for="c in cards" :key="c.key">
          <el-card class="stat" shadow="hover">
            <div class="stat-label">{{ c.label }}</div>
            <div class="stat-value" :style="{ color: c.color }">
              {{ stats[c.key] ?? '-' }}<span class="stat-unit">{{ c.unit }}</span>
            </div>
            <div class="stat-hint">{{ c.hint }}</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 图表 -->
      <el-row :gutter="16" style="margin-top:16px">
        <el-col :xs="24" :md="16">
          <el-card shadow="hover">
            <template #header>
              <div class="card-head">
                <span>最近 30 天识别量</span>
                <el-tag size="small" type="success">{{ trendTotal }} 次</el-tag>
              </div>
            </template>
            <div ref="trendBox" class="chart"></div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="8">
          <el-card shadow="hover">
            <template #header>病害分类分布</template>
            <div ref="pieBox" class="chart"></div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top:16px">
        <el-col :xs="24" :md="12">
          <el-card shadow="hover">
            <template #header>危害等级分布</template>
            <div ref="levelBox" class="chart-sm"></div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card shadow="hover">
            <template #header>
              <div class="card-head">
                <span>识别次数 Top 10</span>
                <el-input v-model="topKeyword" size="small" placeholder="搜索病害" style="width:160px" clearable />
              </div>
            </template>
            <el-table :data="filteredTop" size="small" height="260" stripe>
              <el-table-column type="index" width="50" label="#" />
              <el-table-column prop="name" label="病害名称" min-width="160" sortable />
              <el-table-column prop="times" label="次数" width="90" sortable />
              <el-table-column prop="lastTime" label="最近一次" width="170" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      </template>

      <!-- ===== 病虫害库（ProTable 高级表格）===== -->
      <template v-else>
        <ProTable
          title="病虫害库"
          :columns="tableColumns"
          :data="rows"
          :total="tableTotal"
          :loading="tableLoading"
          :page="tablePage"
          :page-size="tablePageSize"
          search-placeholder="搜名称/分类"
          :filters="[
            { label: '全部', value: 'all' },
            { label: '已核实', value: '1' },
            { label: '待核实', value: '0' }
          ]"
          export-url="/api/dashboard/export/diseases.csv"
          storage-key="pro-table-disease-columns"
          @search="onTableSearch"
          @refresh="loadTable"
          @update:page="(p) => { tablePage = p; loadTable() }"
          @update:page-size="(s) => { tablePageSize = s; tablePage = 1; loadTable() }"
        />
      </template>

      <div class="foot-note">
        数据来自后端只读接口 <code>/api/dashboard/*</code>，需要管理员权限；图表用 ECharts 渲染。
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { login, getToken, setToken, clearToken, overview, trend, distribution, top, diseases } from './api.js'
import ProTable from './components/ProTable.vue'

const token = ref(getToken())
const username = ref('')
const password = ref('')
const logging = ref(false)
const loading = ref(false)
const who = ref(localStorage.getItem('dash_user') || 'admin')

const stats = ref({})
const trendItems = ref([])
const dist = ref({ category: [], level: [], verified: [] })
const topList = ref([])
const topKeyword = ref('')

// ===== 病虫害库表（ProTable）=====
const activeTab = ref('overview')
const rows = ref([])
const tableTotal = ref(0)
const tableLoading = ref(false)
const tablePage = ref(1)
const tablePageSize = ref(10)
const tableQuery = ref({ keyword: '', filter: '' })
const tableColumns = [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'name', label: '病害名称', minWidth: 200, sortable: false },
  { prop: 'category', label: '分类', minWidth: 160 },
  { prop: 'type', label: '类型', minWidth: 120 },
  { prop: 'levelText', label: '危害等级', width: 110 },
  { prop: 'verified', label: '状态', width: 100, type: 'boolean' },
  { prop: 'source', label: '数据来源', minWidth: 220 },
  { prop: 'medCount', label: '用药条数', width: 100 },
  { prop: 'verifyDate', label: '核对日期', width: 120 }
]

const trendBox = ref(null)
const pieBox = ref(null)
const levelBox = ref(null)
let charts = []

const cards = [
  { key: 'diseases', label: '病虫害总数', unit: ' 条', hint: '知识库全部条目', color: '#0f766e' },
  { key: 'verified', label: '已核实（App 可见）', unit: ' 条', hint: '有来源且人工复核', color: '#059669' },
  { key: 'users', label: '用户数', unit: ' 人', hint: '含微信登录', color: '#2563eb' },
  { key: 'histories', label: '识别记录', unit: ' 条', hint: '全部用户的识别历史', color: '#7c3aed' },
  { key: 'correctionsPending', label: '待复核纠错', unit: ' 条', hint: '需要人工判断', color: '#d97706' },
  { key: 'wxUsers', label: '微信用户', unit: ' 人', hint: '小程序一键登录', color: '#16a34a' },
  { key: 'feedback', label: '意见反馈', unit: ' 条', hint: '用户留言', color: '#0891b2' },
  { key: 'collections', label: '收藏总数', unit: ' 条', hint: '用户收藏的病害', color: '#db2777' }
]

const trendTotal = computed(() => trendItems.value.reduce((s, x) => s + (x.count || 0), 0))
const filteredTop = computed(() => {
  const k = topKeyword.value.trim()
  if (!k) return topList.value
  return topList.value.filter((x) => String(x.name).includes(k))
})

async function doLogin() {
  if (!username.value || !password.value) return ElMessage.warning('请填写账号和密码')
  logging.value = true
  try {
    const data = await login(username.value, password.value)
    if (!data.userInfo || !data.userInfo.isAdmin) {
      ElMessage.error('这个账号不是管理员，无法查看数据看板')
      return
    }
    setToken(data.token)
    localStorage.setItem('dash_user', data.userInfo.username || 'admin')
    who.value = data.userInfo.username || 'admin'
    token.value = data.token
    await nextTick()
    await loadAll()
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

// 加载病虫害库表格（服务端分页 + 关键词 + 核实状态筛选）
async function loadTable() {
  tableLoading.value = true
  try {
    const data = await diseases({
      page: tablePage.value,
      pageSize: tablePageSize.value,
      keyword: tableQuery.value.keyword,
      // 'all' 不传筛选条件
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

function onTableSearch({ keyword, filter }) {
  tableQuery.value = { keyword, filter }
  tablePage.value = 1
  loadTable()
}

async function loadAll() {
  loading.value = true
  try {
    const [o, t, d, tp] = await Promise.all([overview(), trend(30), distribution(), top(10)])
    stats.value = o || {}
    trendItems.value = (t && t.items) || []
    dist.value = d || { category: [], level: [], verified: [] }
    topList.value = tp || []
    await nextTick()
    renderCharts()
  } catch (e) {
    if (/登录已过期/.test(e.message)) { logout(); ElMessage.error('登录已过期') }
    else ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function renderCharts() {
  if (!trendBox.value || !pieBox.value || !levelBox.value) return
  charts.forEach((c) => c && c.dispose())
  charts = []

  const trendChart = echarts.init(trendBox.value)
  trendChart.setOption({
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trendItems.value.map((x) => x.date), axisLine: { lineStyle: { color: '#cbd5e1' } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{
      type: 'line', smooth: true, showSymbol: false,
      data: trendItems.value.map((x) => x.count),
      lineStyle: { width: 3, color: '#059669' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(5,150,105,.35)' },
          { offset: 1, color: 'rgba(5,150,105,.02)' }
        ])
      }
    }]
  })

  const pieChart = echarts.init(pieBox.value)
  pieChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['42%', '66%'], center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: (dist.value.category || []).map((x) => ({
        // 图例太长会截断，把「部名录·二类（AI草稿）」压成「部名录·二类」
        name: String(x.name).replace(/（[^）]*）/g, '').trim(),
        value: x.value
      }))
    }]
  })

  const levelChart = echarts.init(levelBox.value)
  levelChart.setOption({
    grid: { left: 70, right: 24, top: 16, bottom: 24 },
    tooltip: {},
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: (dist.value.level || []).map((x) => x.name) },
    series: [{
      type: 'bar', barWidth: 18,
      data: (dist.value.level || []).map((x) => x.value),
      itemStyle: { borderRadius: [0, 9, 9, 0], color: '#34d399' }
    }]
  })

  charts = [trendChart, pieChart, levelChart]
  window.addEventListener('resize', resizeAll)
}

function resizeAll() { charts.forEach((c) => c && c.resize()) }

// 切到「病虫害库」时如果还没数据，补一次
watch(activeTab, (v) => { if (v === 'diseases' && !rows.value.length) loadTable() })

onMounted(async () => {
  if (token.value) { await loadAll(); await loadTable() }
})
onBeforeUnmount(() => window.removeEventListener('resize', resizeAll))
</script>

<style scoped>
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #ecfdf5, #e0f2fe); }
.login-card { width: 380px; border-radius: 16px; }
.login-head { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
.logo { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #34d399, #059669); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; }
.login-title { font-size: 18px; font-weight: 700; }
.login-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.login-tip { margin-top: 14px; font-size: 12px; color: #94a3b8; text-align: center; }

.topbar { height: 56px; background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; position: sticky; top: 0; z-index: 10; }
.brand { font-weight: 700; display: flex; align-items: center; gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #10b981; }
.top-right { display: flex; align-items: center; gap: 10px; }
.who { font-size: 13px; color: #64748b; }
.content { padding: 8px 20px 40px; }
.main-tabs { margin-bottom: 12px; }
.stat { border-radius: 12px; margin-bottom: 16px; }
.stat-label { font-size: 13px; color: #64748b; }
.stat-value { font-size: 26px; font-weight: 700; margin-top: 6px; }
.stat-unit { font-size: 13px; font-weight: 400; color: #94a3b8; }
.stat-hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
.chart { height: 300px; }
.chart-sm { height: 300px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.foot-note { margin-top: 16px; font-size: 12px; color: #94a3b8; }
.foot-note code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
</style>
