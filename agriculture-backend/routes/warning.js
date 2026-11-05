const express = require('express')
const router = express.Router()
const warnCtrl = require('../controllers/warning')

router.get('/list', warnCtrl.getWarningList)
router.get('/risk', warnCtrl.getRisk)

module.exports = router