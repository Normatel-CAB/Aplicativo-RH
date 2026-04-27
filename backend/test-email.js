// Teste de envio de email
// Execute: node backend/test-email.js

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carregar .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(linha => {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) return;
    const idx = texto.indexOf('=');
    if (idx <= 0) return;
    const chave = texto.slice(0, idx).trim();
    const valor = texto.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[chave]) process.env[chave] = valor;
  });
}

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT) || 587;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// Email destino do teste — altere se quiser receber em outro endereço
const EMAIL_DESTINO = process.argv[2] || EMAIL_USER;

console.log('\n=== TESTE DE EMAIL ===');
console.log(`Host SMTP : ${EMAIL_HOST}:${EMAIL_PORT}`);
console.log(`Usuário   : ${EMAIL_USER}`);
console.log(`Senha     : ${EMAIL_PASS ? '***' + EMAIL_PASS.slice(-3) : '(não definida)'}`);
console.log(`Destino   : ${EMAIL_DESTINO}`);
console.log('');

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error('❌ EMAIL_USER ou EMAIL_PASS não definidos no backend/.env');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: false,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { rejectUnauthorized: false }
});

console.log('Verificando conexão com servidor SMTP...');
transporter.verify((erro) => {
  if (erro) {
    console.error('❌ Falha na conexão SMTP:');
    console.error('   ' + erro.message);
    console.error('');
    if (erro.message.includes('Invalid login') || erro.message.includes('535')) {
      console.error('→ Senha incorreta ou App Password necessária.');
      console.error('  Se usar Gmail/Google Workspace com 2FA:');
      console.error('  https://myaccount.google.com/apppasswords');
    } else if (erro.message.includes('ECONNREFUSED') || erro.message.includes('ETIMEDOUT')) {
      console.error('→ Servidor SMTP incorreto ou bloqueado.');
      console.error(`  Tente trocar EMAIL_HOST no .env para o servidor correto.`);
    }
    process.exit(1);
  }

  console.log('✓ Conexão SMTP ok. Enviando email de teste...');

  transporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_DESTINO,
    subject: 'Teste de email – Sistema RH Normatel',
    html: `
      <div style="font-family:Arial,sans-serif;padding:20px">
        <h2 style="color:#2e7d32">✓ Email funcionando!</h2>
        <p>Este é um email de teste do sistema RH da Normatel Engenharia.</p>
        <p><strong>Host SMTP:</strong> ${EMAIL_HOST}:${EMAIL_PORT}</p>
        <p><strong>Remetente:</strong> ${EMAIL_FROM}</p>
        <p style="color:#888;font-size:12px">Enviado em: ${new Date().toLocaleString('pt-BR')}</p>
      </div>
    `
  }, (err, info) => {
    if (err) {
      console.error('❌ Falha ao enviar:', err.message);
      process.exit(1);
    }
    console.log('✅ Email enviado com sucesso!');
    console.log('   ID da mensagem:', info.messageId);
    console.log('   Verifique a caixa de entrada de:', EMAIL_DESTINO);
    console.log('   (Verifique também o SPAM)');
  });
});
