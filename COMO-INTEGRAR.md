# 💳 Integración Webpay Plus - Fundación Recuperando Vidas

## 📍 Tu estado actual
- ✅ Afiliación iniciada (N° 1-12027270234)
- ✅ Sitio web en Vercel
- 🔜 Integrar (estás aquí)
- 🔜 Validar con Transbank
- 🔜 Producción

---

## 🚀 PASO 1: Instalar y probar el backend

```bash
# 1. Entra a la carpeta del backend
cd backend-webpay

# 2. Instala las dependencias
npm install

# 3. Prueba la conexión con Webpay (ambiente de pruebas)
npm test
# → Te mostrará una URL, ábrela en el navegador para probar

# 4. Inicia el servidor
npm run dev
```

---

## 🃏 PASO 2: Tarjetas de prueba oficiales Transbank

Para probar pagos usa estas tarjetas (NO son reales):

| Tarjeta | Número | CVV | Resultado |
|---------|--------|-----|-----------|
| VISA | `4051 8856 0044 6623` | 123 | ✅ APROBADA |
| AMEX | `3700 0000 0002 032` | 1234 | ✅ APROBADA |
| Redcompra | `4051 8842 3993 7763` | — | ✅ APROBADA |
| MASTERCARD | `5186 0595 5959 0568` | 123 | ❌ RECHAZADA |

**RUT para autenticación:** `11.111.111-1` | **Clave:** `123`

---

## 🌐 PASO 3: Conectar el frontend React

En tu `App.jsx`, reemplaza las funciones de pago:

```javascript
const handleDonacion = async (causa, monto) => {
  try {
    const buyOrder  = `DONA-${Date.now()}`
    const sessionId = `SES-${Math.random().toString(36).substr(2,9)}`
    const returnUrl = `${window.location.origin}/resultado-pago`

    // Llama al backend
    const res = await fetch('http://localhost:3001/api/webpay/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyOrder, sessionId, amount: monto, returnUrl })
    })

    const { token, url } = await res.json()

    // Redirige a Webpay
    window.location.href = `${url}?token_ws=${token}`

  } catch (error) {
    console.error('Error:', error)
    alert('Error al iniciar el pago. Intenta nuevamente.')
  }
}
```

---

## 📄 PASO 4: Crear página de resultado

Crea el archivo `src/components/ResultadoPago.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

function ResultadoPago() {
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token_ws')

    if (!token) {
      setCargando(false)
      setResultado({ success: false, message: 'Pago cancelado' })
      return
    }

    fetch('http://localhost:3001/api/webpay/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_ws: token })
    })
    .then(r => r.json())
    .then(data => { setResultado(data); setCargando(false) })
    .catch(() => { setResultado({ success: false }); setCargando(false) })
  }, [])

  if (cargando) return <div style={{textAlign:'center',padding:'4rem'}}>Verificando pago...</div>

  return (
    <div style={{textAlign:'center', padding:'4rem', maxWidth:'500px', margin:'0 auto'}}>
      {resultado?.success ? (
        <>
          <CheckCircle size={64} color="#0DB5A0" style={{marginBottom:'1rem'}} />
          <h1 style={{color:'#0F1B2D'}}>¡Donación Exitosa!</h1>
          <p>Monto: <strong>${resultado.amount?.toLocaleString('es-CL')}</strong></p>
          <p>Autorización: <strong>{resultado.authorizationCode}</strong></p>
          <p>Orden: <strong>{resultado.buyOrder}</strong></p>
          <p style={{marginTop:'1rem',color:'#666'}}>¡Gracias por apoyar a Fundación Recuperando Vidas!</p>
        </>
      ) : (
        <>
          <XCircle size={64} color="#FF5E5B" style={{marginBottom:'1rem'}} />
          <h1 style={{color:'#0F1B2D'}}>Pago No Completado</h1>
          <p style={{color:'#666'}}>El pago fue rechazado o cancelado. Puedes intentarlo nuevamente.</p>
        </>
      )}
      <button
        onClick={() => window.location.href = '/'}
        style={{marginTop:'2rem', padding:'0.75rem 2rem', background:'#0F1B2D', color:'white', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'1rem'}}
      >
        Volver al inicio
      </button>
    </div>
  )
}

export default ResultadoPago
```

---

## ✅ PASO 5: Validación con Transbank

Una vez que funcione todo correctamente en pruebas:

### 1. Completa el formulario online:
👉 https://form.typeform.com/to/ibXdg6Av

### 2. Debes registrar estas transacciones de prueba:
- Al menos **1 transacción APROBADA** con tarjeta VISA
- Al menos **1 transacción RECHAZADA** con MASTERCARD
- Al menos **1 transacción APROBADA** con Redcompra

### 3. Información que necesitarás:
- Órdenes de compra (buyOrder) de las transacciones
- Fecha y hora de las transacciones
- Logo de la fundación (PNG o GIF, 130x59 px)

### 4. Envía evidencias a:
📧 soporte@transbank.cl

---

## 🔴 PASO 6: Pasar a Producción

Cuando Transbank apruebe la validación te enviará:
- Tu **código de comercio real**
- Tu **llave secreta (API Key Secret)**

Luego actualiza el archivo `.env`:

```env
WEBPAY_COMMERCE_CODE=TU_CODIGO_REAL
WEBPAY_API_KEY=TU_LLAVE_SECRETA_REAL
NODE_ENV=production
```

Y haz una transacción real de $50 para confirmar.

---

## 📞 Contacto Transbank

- **Soporte:** soporte@transbank.cl
- **Teléfono fijo:** 600 638 6380
- **Celular:** +56 2 2661 2700
- **Slack:** https://invitacion-slack.transbankdevelopers.cl/slack_community

