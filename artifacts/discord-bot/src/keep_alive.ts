import express from 'express';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('El bot está vivo y funcionando 24/7');
});

app.listen(port, () => {
  console.log(`Servidor 24/7 activo en el puerto ${port}`);
});
