const express = require('express')
const router = express.Router()
const userController = require('../controllers/user')
const auth = require('../middleware/auth')
const rateLimit = require('../middleware/rateLimit')

// 注册、登录无需鉴权
router.post('/register', userController.register)
// 登录限流：同一来源每分钟最多 12 次尝试
router.post('/wx-login', userController.wxLogin)
router.post('/login', rateLimit({ windowMs: 60 * 1000, max: 12, message: '登录尝试过于频繁' }), userController.login)

// 个人信息、退出需要登录鉴权
router.get('/info', auth, userController.getUserInfo)
router.post('/logout', auth, userController.logout)
router.post('/feedback', auth, userController.submitFeedback)

// 修改昵称 / 头像
router.post('/profile', auth, userController.updateProfile)

// 修改自己的密码
router.post('/change-password', auth, userController.changePassword)

module.exports = router