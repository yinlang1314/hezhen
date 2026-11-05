<template>
  <!--
    ProTable：Element Plus 的 el-table 外面包一层「高级表格」骨架
    工具条（标题 / 搜索 / 刷新 / 列设置 / 导出）+ 表格 + 分页
    做法上就是 el-table + el-pagination 的组合，没有引入第三方封装，
    名字沿用 Ant Design Pro 的 ProTable 叫法，答辩时好讲。
  -->
  <el-card class="pro-table" shadow="hover">
    <template #header>
      <div class="pt-head">
        <div class="pt-title">
          <span>{{ title }}</span>
          <el-tag v-if="total" size="small" type="info" effect="plain">{{ total }} 条</el-tag>
        </div>
        <div class="pt-actions">
          <el-input
            v-if="searchable"
            v-model="keyword"
            size="small"
            :placeholder="searchPlaceholder"
            clearable
            style="width:200px"
            @keyup.enter="emitSearch"
            @clear="emitSearch"
          >
            <template #append>
              <el-button size="small" @click="emitSearch">搜索</el-button>
            </template>
          </el-input>

          <el-select v-if="filters && filters.length" v-model="activeFilter" size="small" style="width:130px" @change="emitSearch">
            <el-option v-for="f in filters" :key="f.value" :label="f.label" :value="f.value" />
          </el-select>

          <el-tooltip content="刷新">
            <el-button size="small" :loading="loading" @click="$emit('refresh')">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </el-tooltip>

          <el-popover placement="bottom-end" :width="200" trigger="click">
            <template #reference>
              <el-button size="small">列设置</el-button>
            </template>
            <el-checkbox
              v-for="col in columns"
              :key="col.prop"
              :model-value="visibleKeys.includes(col.prop)"
              :label="col.label"
              style="display:flex;margin:4px 0"
              @change="(v) => toggleColumn(col.prop, v)"
            />
          </el-popover>

          <el-button v-if="exportUrl" size="small" type="success" plain @click="doExport">导出 Excel</el-button>
        </div>
      </div>
    </template>

    <el-table
      :data="data"
      v-loading="loading"
      size="small"
      stripe
      :height="height"
      empty-text="没有数据"
      @sort-change="onSortChange"
    >
      <el-table-column type="index" label="#" width="56" />
      <el-table-column
        v-for="col in shownColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :min-width="col.minWidth"
        :sortable="col.sortable ? 'custom' : false"
        :show-overflow-tooltip="col.overflow !== false"
      >
        <template #default="{ row }">
          <slot :name="col.prop" :row="row">
            <el-tag v-if="col.type === 'boolean'" size="small" :type="row[col.prop] ? 'success' : 'info'">
              {{ row[col.prop] ? '已核实' : '待核实' }}
            </el-tag>
            <span v-else>{{ row[col.prop] ?? '-' }}</span>
          </slot>
        </template>
      </el-table-column>
    </el-table>

    <div class="pt-foot">
      <el-pagination
        v-if="pagination"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        size="small"
        @current-change="(p) => $emit('update:page', p)"
        @size-change="(s) => $emit('update:pageSize', s)"
      />
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getToken } from '../api.js'

const props = defineProps({
  title: { type: String, default: '数据表' },
  columns: { type: Array, required: true },   // [{ prop,label,width,minWidth,sortable,type,overflow }]
  data: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
  pagination: { type: Boolean, default: true },
  searchable: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: '搜索' },
  filters: { type: Array, default: () => [] },  // [{ label, value }]
  exportUrl: { type: String, default: '' },
  height: { type: [String, Number], default: undefined },
  storageKey: { type: String, default: 'pro-table-columns' }
})

const emit = defineEmits(['search', 'refresh', 'sort-change', 'update:page', 'update:pageSize'])

const keyword = ref('')
const activeFilter = ref((props.filters && props.filters[0] && props.filters[0].value) || '')
const visibleKeys = ref([])

// 列显隐持久化：用户隐藏过的列，下次打开还在
const allKeys = computed(() => props.columns.map((c) => c.prop))
try {
  const saved = JSON.parse(localStorage.getItem(props.storageKey) || '[]')
  visibleKeys.value = saved.length ? saved : allKeys.value
} catch (e) { visibleKeys.value = allKeys.value }

const shownColumns = computed(() => props.columns.filter((c) => visibleKeys.value.includes(c.prop)))

function toggleColumn(key, on) {
  const set = new Set(visibleKeys.value)
  if (on) set.add(key); else set.delete(key)
  visibleKeys.value = allKeys.value.filter((k) => set.has(k))
  localStorage.setItem(props.storageKey, JSON.stringify(visibleKeys.value))
}

function emitSearch() {
  emit('search', { keyword: keyword.value, filter: activeFilter.value })
}

function onSortChange({ prop, order }) {
  emit('sort-change', { prop, order })
}

// 导出：带 JWT 直接拿 CSV（后端已带 BOM，Excel 不乱码）
async function doExport() {
  try {
    const res = await fetch(props.exportUrl, { headers: { Authorization: 'Bearer ' + getToken() } })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = props.title + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('导出失败：' + e.message)
  }
}

watch(() => props.columns, () => {
  visibleKeys.value = visibleKeys.value.filter((k) => allKeys.value.includes(k))
  if (!visibleKeys.value.length) visibleKeys.value = allKeys.value
})
</script>

<style scoped>
.pro-table { border-radius: 12px; }
.pt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.pt-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.pt-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pt-foot { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
