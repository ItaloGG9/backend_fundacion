const express = require('express')
const { WebpayPlus, Environment, Options } = require('transbank-sdk')
const cors = require('cors')
const { Resend } = require('resend')
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

// ── RESEND CONFIG ──
const resend = new Resend(process.env.RESEND_API_KEY)

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

      // Responder al frontend INMEDIATAMENTE
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

      // Enviar emails EN SEGUNDO PLANO (no bloquea la respuesta)
      if (tarjetaDatos) {
        console.log('📧 Enviando emails en segundo plano...')
        console.log('📧 Email cliente:', tarjetaDatos.emailCliente)
        console.log('📧 Email destinatario:', tarjetaDatos.emailDestinatario)
        enviarEmailCliente(tarjetaDatos, response)
          .then(() => console.log('📧 Email cliente enviado'))
          .catch(err => console.error('❌ Error email cliente:', err.message))
        enviarEmailFundacion(tarjetaDatos, response)
          .then(() => console.log('📧 Email fundación enviado'))
          .catch(err => console.error('❌ Error email fundación:', err.message))
      } else {
        console.log('⚠️ No hay datos de tarjeta')
      }
    } else {
      res.json({ success: false, status: response.status, message: 'Pago no autorizado' })
    }
  } catch (error) {
    console.error('❌ Error al confirmar:', error.message)
    res.status(500).json({ error: 'Error al confirmar pago', detail: error.message })
  }
})

// ── EMAIL 1: AL CLIENTE ──
async function enviarEmailCliente(datos, pago) {
  try {
    const { paraQuien, quienManda, mensaje, emailCliente, tarjeta } = datos
    const remitente = quienManda || 'Tú'

    await resend.emails.send({
      from: 'Fundación Recuperando Vidas <no-reply@recuperandovidas.cl>',
      to: emailCliente,
      subject: `✅ Confirmación de compra - Tarjeta "${tarjeta.nombre}"`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #F5F1E8; padding: 2rem; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <h2 style="color: #5A8F7B; margin: 0.5rem 0;">Fundación Recuperando Vidas</h2>
          </div>
          <div style="background: white; border-radius: 12px; padding: 2rem;">
            <h1 style="color: #5A8F7B; font-size: 1.75rem; margin-bottom: 0.5rem;">¡Compra confirmada! 🎉</h1>
            <p style="color: #6b7280;">Hemos recibido tu pago exitosamente.</p>
            <div style="background: #F5F1E8; border-radius: 10px; padding: 1.25rem; margin: 1.5rem 0;">
              <table style="width: 100%; font-size: 0.9rem;">
                <tr><td style="color: #9ca3af; padding: 0.3rem 0;">Tarjeta</td><td style="color: #374151; font-weight: 600; text-align: right;">${tarjeta.nombre}</td></tr>
                <tr><td style="color: #9ca3af; padding: 0.3rem 0;">Para quién</td><td style="color: #374151; font-weight: 600; text-align: right;">${paraQuien}</td></tr>
                <tr><td style="color: #9ca3af; padding: 0.3rem 0;">De parte de</td><td style="color: #374151; font-weight: 600; text-align: right;">${remitente}</td></tr>
                <tr><td style="color: #9ca3af; padding: 0.3rem 0;">Monto pagado</td><td style="color: #5A8F7B; font-weight: 700; text-align: right;">$${pago.amount.toLocaleString('es-CL')}</td></tr>
                <tr><td style="color: #9ca3af; padding: 0.3rem 0;">N° Autorización</td><td style="color: #374151; font-weight: 600; text-align: right;">${pago.authorization_code}</td></tr>
              </table>
            </div>
            <div style="background: #e8f4f1; border-left: 4px solid #5A8F7B; padding: 1rem; border-radius: 0 8px 8px 0; margin-bottom: 1.5rem;">
              <p style="color: #374151; margin: 0; font-size: 0.95rem;">
                <strong>⏰ ¿Cuándo llegará la tarjeta?</strong><br/>
                Nuestra diseñadora preparará tu tarjeta personalizada y la enviaremos en <strong>24 a 48 horas hábiles</strong>.
              </p>
            </div>
          </div>
          <p style="text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 1.5rem;">
            Gracias por apoyar nuestra fundación 💚<br/>recuperandovidas.cl
          </p>
        </div>
      `
    })
    console.log('📧 Email cliente enviado a:', emailCliente)
  } catch (error) {
    console.error('❌ Error email cliente:', error.message)
  }
}

// ── EMAIL 2: A LA FUNDACIÓN ──
async function enviarEmailFundacion(datos, pago) {
  try {
    const { paraQuien, quienManda, mensaje, emailDestinatario, emailCliente, tarjeta, enviarAlCliente } = datos

    console.log('📧 Enviando email fundación a: recuperandovidascl@gmail.com')
    
    const response = await resend.emails.send({
      from: 'Sistema Recuperando Vidas <no-reply@recuperandovidas.cl>',
      to: 'recuperandovidascl@gmail.com',
      subject: `🎨 NUEVO PEDIDO - Tarjeta "${tarjeta.nombre}" para ${paraQuien}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 1.5rem; border: 2px solid #5A8F7B; border-radius: 12px;">
          <h1 style="color: #5A8F7B; border-bottom: 2px solid #F5F1E8; padding-bottom: 1rem;">🎨 Nuevo pedido de tarjeta virtual</h1>
          <div style="background: #fff3cd; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="margin: 0; font-weight: bold; color: #856404;">⚠️ ACCIÓN REQUERIDA: Diseñar y enviar la tarjeta al destinatario.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
            <tr style="background: #F5F1E8;"><td style="padding: 0.6rem; font-weight: bold;">Tarjeta elegida</td><td style="padding: 0.6rem;">${tarjeta.nombre}</td></tr>
            <tr><td style="padding: 0.6rem; font-weight: bold;">Para quién</td><td style="padding: 0.6rem;">${paraQuien}</td></tr>
            <tr style="background: #F5F1E8;"><td style="padding: 0.6rem; font-weight: bold;">De parte de</td><td style="padding: 0.6rem;">${quienManda || '(anónimo)'}</td></tr>
            <tr><td style="padding: 0.6rem; font-weight: bold; color: #dc2626;">📧 Enviar tarjeta a</td><td style="padding: 0.6rem; color: #dc2626; font-weight: bold;">${emailDestinatario} ${enviarAlCliente ? '(mismo que compró)' : ''}</td></tr>
            <tr style="background: #F5F1E8;"><td style="padding: 0.6rem; font-weight: bold;">Email del cliente</td><td style="padding: 0.6rem;">${emailCliente}</td></tr>
            <tr><td style="padding: 0.6rem; font-weight: bold;">Monto pagado</td><td style="padding: 0.6rem; color: #5A8F7B; font-weight: bold;">$${pago.amount.toLocaleString('es-CL')}</td></tr>
            <tr style="background: #F5F1E8;"><td style="padding: 0.6rem; font-weight: bold;">N° Autorización</td><td style="padding: 0.6rem;">${pago.authorization_code}</td></tr>
            <tr><td style="padding: 0.6rem; font-weight: bold;">Fecha</td><td style="padding: 0.6rem;">${new Date().toLocaleString('es-CL')}</td></tr>
          </table>
          <h2 style="color: #374151; font-size: 1.1rem;">💬 Mensaje para la tarjeta:</h2>
          <div style="background: #F5F1E8; border-left: 4px solid #D4856A; padding: 1rem; border-radius: 0 8px 8px 0; margin-bottom: 1.5rem;">
            <p style="margin: 0; font-style: italic; color: #374151;">"${mensaje}"</p>
          </div>
          <div style="background: #d4edda; border-radius: 8px; padding: 1rem;">
            <h3 style="color: #155724; margin: 0 0 0.5rem 0;">✅ Pasos a seguir:</h3>
            <ol style="color: #155724; margin: 0; padding-left: 1.25rem;">
              <li>Diseñar la tarjeta con el mensaje indicado</li>
              <li>Enviarla a: <strong>${emailDestinatario}</strong></li>
              <li>Indicar que es de parte de: <strong>${quienManda || 'un amigo/a'}</strong></li>
            </ol>
          </div>
        </div>
      `
    })
    console.log('📧 Email fundación enviado, respuesta Resend:', JSON.stringify(response))
  } catch (error) {
    console.error('❌ Error email fundación:', error.message, JSON.stringify(error))
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