const express = require('express')
const { WebpayPlus, Environment, Options } = require('transbank-sdk')
const cors = require('cors')
const nodemailer = require('nodemailer')
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

// ── WEBPAY CONFIG ──
const tx = new WebpayPlus.Transaction(
  new Options(
    process.env.WEBPAY_COMMERCE_CODE || '597055555532',
    process.env.WEBPAY_API_KEY       || '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
    process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Integration
  )
)

// ── EMAIL CONFIG ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'recuperandovidascl@gmail.com',
    pass: process.env.EMAIL_PASS || 'tu_contrasena_de_aplicacion'
  }
})

// ── INICIAR TRANSACCIÓN ──
app.post('/api/webpay/init', async (req, res) => {
  try {
    const { buyOrder, sessionId, amount, returnUrl } = req.body
    console.log('🛒 Iniciando transacción:', { buyOrder, amount })
    const response = await tx.create(buyOrder, sessionId, amount, returnUrl)
    res.json({ token: response.token, url: response.url })
  } catch (error) {
    console.error('❌ Error:', error.message)
    res.status(500).json({ error: 'Error al iniciar pago', detail: error.message })
  }
})

// ── CONFIRMAR Y ENVIAR EMAIL ──
app.post('/api/webpay/confirm', async (req, res) => {
  try {
    const { token_ws, tarjetaDatos } = req.body
    console.log('🔍 Confirmando token:', token_ws)

    const response = await tx.commit(token_ws)

    if (response.status === 'AUTHORIZED') {
      console.log('✅ Pago aprobado:', response.amount)

      // Enviar email si hay datos de tarjeta
      if (tarjetaDatos) {
        await enviarEmailTarjeta(tarjetaDatos, response)
      }

      res.json({
        success: true,
        status: response.status,
        amount: response.amount,
        authorizationCode: response.authorization_code,
        buyOrder: response.buy_order,
        cardDetail: response.card_detail,
        transactionDate: response.transaction_date,
        paymentType: response.payment_type_code
      })
    } else {
      res.json({ success: false, status: response.status, message: 'Pago no autorizado' })
    }
  } catch (error) {
    console.error('❌ Error al confirmar:', error.message)
    res.status(500).json({ error: 'Error al confirmar pago', detail: error.message })
  }
})

// ── ENVIAR EMAIL TARJETA ──
async function enviarEmailTarjeta(datos, pago) {
  try {
    const { paraQuien, quienManda, mensaje, emailDestinatario, tarjeta } = datos
    const remitente = quienManda || 'Alguien especial'

    // Email al DESTINATARIO
    await transporter.sendMail({
      from: `"Recuperando Vidas" <recuperandovidascl@gmail.com>`,
      to: emailDestinatario,
      subject: `🎴 Tienes una tarjeta virtual de ${remitente}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #F5F1E8; padding: 2rem; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <img src="https://www.recuperandovidas.cl/logo.png" alt="Recuperando Vidas" style="width: 60px; height: 60px; object-fit: contain;" />
            <h2 style="color: #5A8F7B; margin: 0.5rem 0;">Fundación Recuperando Vidas</h2>
          </div>

          <div style="background: white; border-radius: 12px; padding: 2rem; text-align: center;">
            <h1 style="color: #5A8F7B; font-size: 2rem; margin-bottom: 0.5rem;">¡Hola ${paraQuien}! 💌</h1>
            <p style="color: #6b7280; font-size: 1rem; margin-bottom: 1.5rem;">${remitente} te envió una tarjeta virtual especial</p>

            <img 
              src="https://www.recuperandovidas.cl${tarjeta.imagen}" 
              alt="${tarjeta.nombre}"
              style="width: 100%; max-width: 400px; border-radius: 12px; margin-bottom: 1.5rem;"
            />

            <div style="background: #F5F1E8; border-left: 4px solid #5A8F7B; padding: 1.25rem; border-radius: 0 8px 8px 0; text-align: left; margin-bottom: 1.5rem;">
              <p style="color: #374151; font-size: 1rem; line-height: 1.7; font-style: italic; margin: 0;">
                "${mensaje}"
              </p>
            </div>

            ${quienManda ? `<p style="color: #9ca3af; font-size: 0.9rem;">Con cariño,<br/><strong style="color: #5A8F7B;">${quienManda}</strong></p>` : ''}
          </div>

          <div style="text-align: center; margin-top: 1.5rem;">
            <p style="color: #9ca3af; font-size: 0.8rem;">Esta tarjeta fue enviada a través de Fundación Recuperando Vidas</p>
            <p style="color: #9ca3af; font-size: 0.8rem;">recuperandovidas.cl</p>
          </div>
        </div>
      `
    })

    // Email a la FUNDACIÓN (confirmación)
    await transporter.sendMail({
      from: `"Sistema Recuperando Vidas" <recuperandovidascl@gmail.com>`,
      to: 'recuperandovidascl@gmail.com',
      subject: `✅ Nueva venta de tarjeta virtual - $${pago.amount.toLocaleString('es-CL')}`,
      html: `
        <h2>Nueva venta de tarjeta virtual</h2>
        <p><strong>Tarjeta:</strong> ${tarjeta.nombre}</p>
        <p><strong>Para:</strong> ${paraQuien}</p>
        <p><strong>Email destinatario:</strong> ${emailDestinatario}</p>
        <p><strong>De parte de:</strong> ${quienManda || 'Anónimo'}</p>
        <p><strong>Monto:</strong> $${pago.amount.toLocaleString('es-CL')}</p>
        <p><strong>Autorización:</strong> ${pago.authorization_code}</p>
        <p><strong>Orden:</strong> ${pago.buy_order}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-CL')}</p>
      `
    })

    console.log('📧 Emails enviados correctamente a:', emailDestinatario)
  } catch (error) {
    console.error('❌ Error enviando email:', error.message)
  }
}

// ── SALUD ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ambiente: process.env.NODE_ENV || 'integration' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
})