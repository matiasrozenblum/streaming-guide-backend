import axios from 'axios';

const API_URL = 'http://localhost:3000';

async function testPerformance() {
  console.log('Iniciando pruebas de rendimiento...\n');

  // Obtener un ID válido primero
  const schedules = await axios.get(`${API_URL}/schedules`);
  const validId = schedules.data[0]?.id;
  
  if (!validId) {
    console.log('No se encontraron schedules para probar');
    return;
  }

  console.log(`Usando schedule ID: ${validId}\n`);

  // Prueba 1: Primera consulta (debería ser lenta, sin caché)
  console.log('Prueba 1: Primera consulta (sin caché)');
  const startTime1 = Date.now();
  await axios.get(`${API_URL}/schedules`);
  const time1 = Date.now() - startTime1;
  console.log(`Tiempo primera consulta: ${time1}ms\n`);

  // Prueba 2: Segunda consulta (debería ser rápida, con caché)
  console.log('Prueba 2: Segunda consulta (con caché)');
  const startTime2 = Date.now();
  await axios.get(`${API_URL}/schedules`);
  const time2 = Date.now() - startTime2;
  console.log(`Tiempo segunda consulta: ${time2}ms\n`);

  // Prueba 3: Consulta individual (primera vez)
  console.log('Prueba 3: Consulta individual (sin caché)');
  const startTime3 = Date.now();
  await axios.get(`${API_URL}/schedules/${validId}`);
  const time3 = Date.now() - startTime3;
  console.log(`Tiempo consulta individual: ${time3}ms\n`);

  // Prueba 4: Misma consulta individual (con caché)
  console.log('Prueba 4: Misma consulta individual (con caché)');
  const startTime4 = Date.now();
  await axios.get(`${API_URL}/schedules/${validId}`);
  const time4 = Date.now() - startTime4;
  console.log(`Tiempo consulta individual con caché: ${time4}ms\n`);

  // Resumen
  console.log('Resumen de rendimiento:');
  console.log(`- Primera consulta (sin caché): ${time1}ms`);
  console.log(`- Segunda consulta (con caché): ${time2}ms`);
  console.log(`- Mejora: ${((time1 - time2) / time1 * 100).toFixed(2)}% más rápido`);
  console.log(`\n- Consulta individual (sin caché): ${time3}ms`);
  console.log(`- Consulta individual (con caché): ${time4}ms`);
  console.log(`- Mejora: ${((time3 - time4) / time3 * 100).toFixed(2)}% más rápido`);
}

testPerformance().catch(console.error); 