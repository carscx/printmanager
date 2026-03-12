import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import { descConfig } from './js/supabase.js'

const supabase = createClient(descConfig.url, descConfig.key)

async function check() {
  const { data, error } = await supabase.from('pedidos').select().limit(1)
  if (data && data.length > 0) {
    console.log("Columnas en 'pedidos':", Object.keys(data[0]))
  } else {
    console.log("No hay datos en la tabla 'pedidos' o error:", error)
  }
}
check()
