import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicialização do Firebase Admin
import fs from 'fs';
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON.endsWith('.json')) {
  serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'utf8'));
} else {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Rota de teste
app.get('/', (req, res) => {
  res.json({ status: 'API RH backend online!' });
});

// Envio de atestado (upload PDF)
app.post('/api/envios', upload.array('arquivos'), async (req, res) => {
  try {
    const { nome, funcao, projeto, tipo_atestado, horas_comparecimento, data_inicio, data_fim, dias } = req.body;
    const arquivos = req.files || [];
    const urls = [];
    for (const file of arquivos) {
      const blob = bucket.file(`atestados/${Date.now()}_${file.originalname}`);
      await blob.save(file.buffer, { contentType: file.mimetype });
      await blob.makePublic();
      urls.push(blob.publicUrl());
    }
    const doc = await db.collection('envios_atestados').add({
      nome, funcao, projeto, tipo_atestado, horas_comparecimento, data_inicio, data_fim, dias,
      arquivos: urls,
      criado_em: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ id: doc.id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar atestados
app.get('/api/envios', async (req, res) => {
  try {
    const snap = await db.collection('envios_atestados').orderBy('criado_em', 'desc').get();
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar usuários pendentes
app.get('/api/usuarios/pendentes', async (req, res) => {
  try {
    const snap = await db.collection('users').where('emailVisibility', '==', false).get();
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aprovar usuário
app.post('/api/usuarios/aprovar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).update({ emailVisibility: true });
    res.json({ id, aprovado: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor RH backend rodando na porta ${PORT}`);
});
