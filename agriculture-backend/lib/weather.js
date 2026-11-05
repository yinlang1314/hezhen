// ==================================================================
// 天气数据（病害风险预警用）
//
// 用 Open-Meteo：免费、不用注册、不用 API Key，返回真实预报。
// 只拉未来 3 天：温度、湿度、降雨——够算发病条件了。
//
// 缓存 30 分钟，避免每次打开预警页都打外部接口。
// ==================================================================
const https = require('https')

// 预警页支持的地区 → 坐标（省会）
const REGIONS = {
  '江西省': { lat: 28.68, lon: 115.86, name: '南昌' },
  '广东省': { lat: 23.13, lon: 113.26, name: '广州' },
  '湖南省': { lat: 28.23, lon: 112.94, name: '长沙' },
  '福建省': { lat: 26.07, lon: 119.30, name: '福州' },
  '浙江省': { lat: 30.27, lon: 120.16, name: '杭州' }
}

const CACHE_TTL = 30 * 60 * 1000
const cache = new Map()   // key: lat,lon → { at, data }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('天气接口返回 ' + res.statusCode))
        try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('天气接口返回格式异常')) }
      })
    })
    req.on('error', (e) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('天气接口超时')) })
  })
}

/**
 * 取某地区未来 3 天预报
 * @param {string} region 地区名（如"江西省"）
 * @returns {Promise<{region, city, lat, lon, updated, days: [{date, tmax, tmin, tmean, humidity, rain}]}>}
 */
async function getForecast(region) {
  const loc = REGIONS[region]
  if (!loc) throw new Error('暂不支持该地区：' + region)

  const key = loc.lat + ',' + loc.lon
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data

  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + loc.lat + '&longitude=' + loc.lon
    + '&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum'
    + '&timezone=Asia%2FShanghai&forecast_days=3'

  const j = await fetchJson(url)
  const d = j.daily || {}
  const days = (d.time || []).map((date, i) => {
    const tmax = Number(d.temperature_2m_max[i])
    const tmin = Number(d.temperature_2m_min[i])
    return {
      date,
      tmax,
      tmin,
      tmean: Math.round(((tmax + tmin) / 2) * 10) / 10,
      humidity: Number(d.relative_humidity_2m_mean[i]),
      rain: Number(d.precipitation_sum[i])
    }
  })

  const data = { region, city: loc.name, lat: loc.lat, lon: loc.lon, updated: new Date().toISOString(), days }
  cache.set(key, { at: Date.now(), data })
  return data
}

module.exports = { REGIONS, getForecast }
