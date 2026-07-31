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
    'https://www.recuperandovidas.cl',
    'https://fundacion-front-opal.vercel.app'
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
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER || 'recuperandovidascl@gmail.com',
    pass: process.env.EMAIL_PASS || ''
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

// ── CONFIRMAR Y ENVIAR EMAILS ──
app.post('/api/webpay/confirm', async (req, res) => {
  try {
    const { token_ws, tarjetaDatos } = req.body
    console.log('🔍 Confirmando token:', token_ws)

    const response = await tx.commit(token_ws)

    if (response.status === 'AUTHORIZED') {
      console.log('✅ Pago aprobado:', response.amount)

      if (tarjetaDatos) {
        // 1. Email al CLIENTE confirmando su compra
        await enviarEmailCliente(tarjetaDatos, response)
        // 2. Email a la FUNDACIÓN con todos los datos para la diseñadora
        await enviarEmailFundacion(tarjetaDatos, response)
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

// ── EMAIL 1: AL CLIENTE (confirmación de compra) ──
async function enviarEmailCliente(datos, pago) {
  try {
    const { paraQuien, quienManda, mensaje, emailCliente, tarjeta } = datos
    const remitente = quienManda || 'Tú'

    await transporter.sendMail({
      from: `"Fundación Recuperando Vidas" <recuperandovidascl@gmail.com>`,
      to: emailCliente,
      subject: `✅ Confirmación de compra - Tarjeta "${tarjeta.nombre}"`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #F5F1E8; padding: 2rem; border-radius: 16px;">
          
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <img src="https://www.recuperandovidas.cl/logo.png" alt="Recuperando Vidas" style="width: 60px; height: 60px;" />
            <h2 style="color: #5A8F7B; margin: 0.5rem 0;">Fundación Recuperando Vidas</h2>
          </div>

          <div style="background: white; border-radius: 12px; padding: 2rem;">
            <h1 style="color: #5A8F7B; font-size: 1.75rem; margin-bottom: 0.5rem;">¡Compra confirmada! 🎉</h1>
            <p style="color: #6b7280;">Hemos recibido tu pago exitosamente.</p>

            <div style="background: #F5F1E8; border-radius: 10px; padding: 1.25rem; margin: 1.5rem 0;">
              <h3 style="color: #374151; margin-bottom: 1rem; font-size: 1rem;">📋 Detalle de tu pedido:</h3>
              <table style="width: 100%; font-size: 0.9rem;">
                <tr>
                  <td style="color: #9ca3af; padding: 0.3rem 0;">Tarjeta</td>
                  <td style="color: #374151; font-weight: 600; text-align: right;">${tarjeta.nombre}</td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; padding: 0.3rem 0;">Para quién</td>
                  <td style="color: #374151; font-weight: 600; text-align: right;">${paraQuien}</td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; padding: 0.3rem 0;">De parte de</td>
                  <td style="color: #374151; font-weight: 600; text-align: right;">${remitente}</td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; padding: 0.3rem 0;">Monto pagado</td>
                  <td style="color: #5A8F7B; font-weight: 700; text-align: right; font-size: 1.1rem;">$${pago.amount.toLocaleString('es-CL')}</td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; padding: 0.3rem 0;">N° Autorización</td>
                  <td style="color: #374151; font-weight: 600; text-align: right;">${pago.authorization_code}</td>
                </tr>
              </table>
            </div>

            <div style="background: #e8f4f1; border-left: 4px solid #5A8F7B; padding: 1rem; border-radius: 0 8px 8px 0; margin-bottom: 1.5rem;">
              <p style="color: #374151; margin: 0; font-size: 0.95rem;">
                <strong>⏰ ¿Cuándo llegará la tarjeta?</strong><br/>
                Nuestra diseñadora preparará tu tarjeta personalizada y la enviaremos al destinatario en un plazo de <strong>24 a 48 horas hábiles</strong>.
              </p>
            </div>

            <p style="color: #6b7280; font-size: 0.9rem;">
              Si tienes alguna pregunta, escríbenos a 
              <a href="mailto:recuperandovidascl@gmail.com" style="color: #5A8F7B;">recuperandovidascl@gmail.com</a>
            </p>
          </div>

          <p style="text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 1.5rem;">
            Gracias por apoyar nuestra fundación 💚<br/>
            recuperandovidas.cl
          </p>
        </div>
      `
    })

    console.log('📧 Email de confirmación enviado al cliente:', emailCliente)
  } catch (error) {
    console.error('❌ Error enviando email al cliente:', error.message)
  }
}

// ── EMAIL 2: A LA FUNDACIÓN (para la diseñadora) ──
async function enviarEmailFundacion(datos, pago) {
  try {
    const { paraQuien, quienManda, mensaje, emailDestinatario, emailCliente, tarjeta } = datos

    await transporter.sendMail({
      from: `"Sistema Recuperando Vidas" <recuperandovidascl@gmail.com>`,
      to: 'recuperandovidascl@gmail.com',
      subject: `🎨 NUEVO PEDIDO - Tarjeta "${tarjeta.nombre}" para ${paraQuien}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 1.5rem; border: 2px solid #5A8F7B; border-radius: 12px;">
          
          <h1 style="color: #5A8F7B; border-bottom: 2px solid #F5F1E8; padding-bottom: 1rem;">
            🎨 Nuevo pedido de tarjeta virtual
          </h1>

          <div style="background: #fff3cd; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="margin: 0; font-weight: bold; color: #856404;">
              ⚠️ ACCIÓN REQUERIDA: La diseñadora debe crear esta tarjeta y enviarla al destinatario.
            </p>
          </div>

          <h2 style="color: #374151; font-size: 1.1rem; margin-bottom: 0.5rem;">📋 Datos del pedido:</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
            <tr style="background: #F5F1E8;">
              <td style="padding: 0.6rem; font-weight: bold; width: 40%;">Tarjeta elegida</td>
              <td style="padding: 0.6rem;">${tarjeta.nombre}</td>
            </tr>
            <tr>
              <td style="padding: 0.6rem; font-weight: bold;">Para quién</td>
              <td style="padding: 0.6rem;">${paraQuien}</td>
            </tr>
            <tr style="background: #F5F1E8;">
              <td style="padding: 0.6rem; font-weight: bold;">De parte de</td>
              <td style="padding: 0.6rem;">${quienManda || '(anónimo)'}</td>
            </tr>
            <tr>
              <td style="padding: 0.6rem; font-weight: bold; color: #dc2626;">📧 Email destinatario</td>
              <td style="padding: 0.6rem; color: #dc2626; font-weight: bold;">${emailDestinatario}</td>
            </tr>
            <tr style="background: #F5F1E8;">
              <td style="padding: 0.6rem; font-weight: bold;">Email del cliente</td>
              <td style="padding: 0.6rem;">${emailCliente || 'No proporcionado'}</td>
            </tr>
          </table>

          <h2 style="color: #374151; font-size: 1.1rem; margin-bottom: 0.5rem;">💬 Mensaje para la tarjeta:</h2>
          <div style="background: #F5F1E8; border-left: 4px solid #D4856A; padding: 1rem; border-radius: 0 8px 8px 0; margin-bottom: 1.5rem;">
            <p style="margin: 0; font-style: italic; color: #374151; line-height: 1.7;">"${mensaje}"</p>
          </div>

          <h2 style="color: #374151; font-size: 1.1rem; margin-bottom: 0.5rem;">💳 Datos del pago:</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
            <tr style="background: #F5F1E8;">
              <td style="padding: 0.6rem; font-weight: bold;">Monto</td>
              <td style="padding: 0.6rem; color: #5A8F7B; font-weight: bold;">$${pago.amount.toLocaleString('es-CL')}</td>
            </tr>
            <tr>
              <td style="padding: 0.6rem; font-weight: bold;">N° Autorización</td>
              <td style="padding: 0.6rem;">${pago.authorization_code}</td>
            </tr>
            <tr style="background: #F5F1E8;">
              <td style="padding: 0.6rem; font-weight: bold;">Orden de compra</td>
              <td style="padding: 0.6rem;">${pago.buy_order}</td>
            </tr>
            <tr>
              <td style="padding: 0.6rem; font-weight: bold;">Fecha</td>
              <td style="padding: 0.6rem;">${new Date().toLocaleString('es-CL')}</td>
            </tr>
          </table>

          <div style="background: #d4edda; border-radius: 8px; padding: 1rem;">
            <h3 style="color: #155724; margin: 0 0 0.5rem 0;">✅ Pasos a seguir:</h3>
            <ol style="color: #155724; margin: 0; padding-left: 1.25rem;">
              <li>Diseñar la tarjeta personalizada con el mensaje indicado</li>
              <li>Enviarla al email: <strong>${emailDestinatario}</strong></li>
              <li>Indicar que es de parte de: <strong>${quienManda || 'un amigo/a'}</strong></li>
            </ol>
          </div>
        </div>
      `
    })

    console.log('📧 Email enviado a la fundación con datos del pedido')
  } catch (error) {
    console.error('❌ Error enviando email a la fundación:', error.message)
  }
}

// ── SALUD ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ambiente: process.env.NODE_ENV || 'integration' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
  console.log(`📧 Email configurado: ${process.env.EMAIL_USER || 'recuperandovidascl@gmail.com'}`)
})