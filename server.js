const express = require('express')
const { WebpayPlus, Environment, Options } = require('transbank-sdk')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(express.json())
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://recuperandovidas.cl',
    'https://www.recuperandovidas.cl'
  ]
}))

// ─── CONFIGURACIÓN ────────────────────────────────
// INTEGRACIÓN (pruebas) - ya viene configurado por defecto en el SDK
// Cuando Transbank te dé las credenciales reales, cambia a configureForProduction
const tx = new WebpayPlus.Transaction(
  new Options(
    process.env.WEBPAY_COMMERCE_CODE || '597055555532',
    process.env.WEBPAY_API_KEY       || '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
    process.env.NODE_ENV === 'production'
      ? Environment.Production
      : Environment.Integration
  )
)

// ─── INICIAR TRANSACCIÓN ──────────────────────────
app.post('/api/webpay/init', async (req, res) => {
  try {
    const { buyOrder, sessionId, amount, returnUrl } = req.body

    console.log('🛒 Iniciando transacción:', { buyOrder, amount })

    const response = await tx.create(buyOrder, sessionId, amount, returnUrl)

    console.log('✅ Transacción creada:', response.token)

    res.json({
      token: response.token,
      url:   response.url
    })
  } catch (error) {
    console.error('❌ Error al crear transacción:', error.message)
    res.status(500).json({ error: 'Error al iniciar pago', detail: error.message })
  }
})

// ─── CONFIRMAR TRANSACCIÓN ────────────────────────
app.post('/api/webpay/confirm', async (req, res) => {
  try {
    const { token_ws } = req.body

    console.log('🔍 Confirmando token:', token_ws)

    const response = await tx.commit(token_ws)

    console.log('📊 Resultado:', response.status, response.amount)

    if (response.status === 'AUTHORIZED') {
      res.json({
        success:           true,
        status:            response.status,
        amount:            response.amount,
        authorizationCode: response.authorization_code,
        buyOrder:          response.buy_order,
        cardDetail:        response.card_detail,
        transactionDate:   response.transaction_date,
        paymentType:       response.payment_type_code
      })
    } else {
      res.json({ success: false, status: response.status, message: 'Pago no autorizado' })
    }
  } catch (error) {
    console.error('❌ Error al confirmar:', error.message)
    res.status(500).json({ error: 'Error al confirmar pago', detail: error.message })
  }
})

// ─── ESTADO DE TRANSACCIÓN ────────────────────────
app.get('/api/webpay/status/:token', async (req, res) => {
  try {
    const response = await tx.status(req.params.token)
    res.json(response)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── SALUD DEL SERVIDOR ───────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ambiente: process.env.NODE_ENV || 'integration' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 Backend Webpay - Recuperando Vidas ║
║  Puerto: ${PORT}                           ║
║  Ambiente: ${process.env.NODE_ENV === 'production' ? 'PRODUCCIÓN 🔴' : 'INTEGRACIÓN 🟡'}          ║
╚════════════════════════════════════════╝
  `)
})
