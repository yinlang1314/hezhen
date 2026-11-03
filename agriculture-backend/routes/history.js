const express = require('express')
const router = express.Router()
const historyCtrl = require('../controllers/history')
const auth = require('../middleware/auth')

// 添加识别历史（需要登录）
router.post('/add', auth, historyCtrl.addHistory)

// 获取历史记录列表（需要登录）
router.get('/list', auth, historyCtrl.getHistoryList)

// 单条历史详情（详情页用，只能查自己的）
router.get('/detail', auth, historyCtrl.getHistoryDetail)

// 删除单条记录
router.post('/delete', auth, historyCtrl.delHistory)

// 清空全部记录
router.post('/clear', auth, historyCtrl.clearHistory)

module.exports = router