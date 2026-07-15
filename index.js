import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['query'] });

const app = express();
const PORT = process.env.PORT || 8888;

const dateToMonthKey = (date) => date.toISOString().slice(0,7);
const previousMonthKey = (month) => {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({ where: { deletedAt: null }, orderBy: { date: 'desc' } });
    const deletedTransactions = await prisma.transaction.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, take: 10 });
    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;
    const today = new Date().toISOString().slice(0,10);
    const currentMonth = dateToMonthKey(new Date());
    res.render('index', { transactions, totalIncome, totalExpense, balance, deletedTransactions, today, currentMonth });
  } catch (error) {
    console.error(error);
    res.status(500).send('エラーが発生しました。');
  }
});

app.post('/transactions', async (req, res) => {
  const { title, amount, type, category, date } = req.body;
  if (title && amount && type && category && date) {
    try {
      await prisma.transaction.create({ data: { title, amount: parseInt(amount, 10), type, category, date: new Date(date) } });
    } catch (error) {
      console.error(error);
    }
  }
  res.redirect('/');
});

// ソフト削除
app.post('/transactions/:id/delete', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch (error) {
    console.error(error);
  }
  res.redirect('/');
});

// Undo
app.post('/transactions/:id/undo', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.transaction.update({ where: { id }, data: { deletedAt: null } });
  } catch (error) {
    console.error(error);
  }
  res.redirect('/');
});

// monthly summary API
app.get('/api/monthly', async (req, res) => {
  try {
    const tx = await prisma.transaction.findMany({ where: { deletedAt: null } });
    const map = {};
    tx.forEach(t => {
      const key = t.date.toISOString().slice(0,7);
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (t.type === 'INCOME') map[key].income += t.amount;
      else map[key].expense += t.amount;
    });
    const labels = Object.keys(map).sort();
    const income = labels.map(k => map[k].income);
    const expense = labels.map(k => map[k].expense);
    res.json({ labels, income, expense });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/category', async (req, res) => {
  try {
    const month = req.query.month;
    const tx = await prisma.transaction.findMany({ where: { deletedAt: null, type: 'EXPENSE' } });
    const map = {};
    tx.forEach(t => {
      const key = dateToMonthKey(new Date(t.date));
      if (month && key !== month) return;
      if (!map[t.category]) map[t.category] = 0;
      map[t.category] += t.amount;
    });
    const categories = Object.keys(map).sort();
    const amounts = categories.map(category => map[category]);
    res.json({ categories, amounts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/monthly-compare', async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) {
      return res.status(400).json({ error: 'month is required' });
    }
    const tx = await prisma.transaction.findMany({ where: { deletedAt: null } });
    const map = {};
    tx.forEach(t => {
      const key = dateToMonthKey(new Date(t.date));
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (t.type === 'INCOME') map[key].income += t.amount;
      else map[key].expense += t.amount;
    });
    const prev = previousMonthKey(month);
    const selected = map[month] ?? { income: 0, expense: 0 };
    const previous = map[prev] ?? { income: 0, expense: 0 };
    res.json({ labels: [prev, month], income: [previous.income, selected.income], expense: [previous.expense, selected.expense] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'failed' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Start the app with a different PORT or free the port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
