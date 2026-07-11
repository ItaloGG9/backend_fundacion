// Script para probar la integración antes de enviar a Transbank
const { WebpayPlus, Environment, Options } = require('transbank-sdk')

const tx = new WebpayPlus.Transaction(
  new Options('597055555532', '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C', Environment.Integration)
)

async function testWebpay() {
  try {
    console.log('🧪 Probando conexión con Webpay...')

    const response = await tx.create(
      `TEST-${Date.now()}`,
      `SESSION-${Date.now()}`,
      20000,
      'http://localhost:5173/resultado'
    )

    console.log('✅ Conexión exitosa!')
    console.log('🔗 URL de pago:', response.url)
    console.log('🎫 Token:', response.token)
    console.log('\nAbre esta URL en tu navegador para probar el pago:')
    console.log(`${response.url}?token_ws=${response.token}`)
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testWebpay()
