const express = require('express')
const router = express.Router()
const collectCtrl = require('../controllers/collection')
const auth = require('../middleware/auth')

router.post('/add',auth,collectCtrl.addCollect)
router.get('/list',auth,collectCtrl.getCollectList)
router.post('/delete',auth,collectCtrl.delCollect)

module.exports = router