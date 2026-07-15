// index.ts
import "dotenv/config";
import express, { Request, Response } from "express";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

const app = express();
const PORT = process.env.PORT || 8888;

const dateToMonthKey = (date: Date) => date.toISOString().slice(0,7);
const previousMonthKey = (month: string) => {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true })); // フォームデータを受け取る設定

// ① 家計簿のトップページ（データ一覧表示）
app.get("/", async (req: Request, res: Response) => {
  try {
    // データベースから新しい順にすべての取引データを取得（削除済みは除外）
    const transactions = await prisma.transaction.findMany({
      where: { deletedAt: null },
      orderBy: { date: 'desc' }
    });
    const deletedTransactions = await prisma.transaction.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      take: 10
    });
    
    // 収入と支出の合計を計算
    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = dateToMonthKey(new Date());

    res.render("index", { transactions, totalIncome, totalExpense, balance, deletedTransactions, today, currentMonth });
  } catch (error) {
    console.error(error);
    res.status(500).send("エラーが発生しました。");
  }
});

// ② 家計簿データの追加処理
app.post("/transactions", async (req: Request, res: Response) => {
  const { title, amount, type, category, date } = req.body;

  if (title && amount && type && category && date) {
    try {
      await prisma.transaction.create({
        data: {
          title,
          amount: parseInt(amount, 10), // 金額を数値に変換
          type,
          category,
          date: new Date(date),
        }
      });
    } catch (error) {
      console.error(error);
    }
  }
  // 保存したらトップページにリダイレクト（戻る）
  res.redirect("/");
});

// ソフト削除：履歴を削除（取り消し可能）
app.post('/transactions/:id/delete', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch (error) {
    console.error(error);
  }
  res.redirect('/');
});

// 取り消し（Undo）
app.post('/transactions/:id/undo', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.transaction.update({ where: { id }, data: { deletedAt: null } });
  } catch (error) {
    console.error(error);
  }
  res.redirect('/');
});

// 月ごとの集計データを返す（JSON）
app.get('/api/monthly', async (req: Request, res: Response) => {
  try {
    const tx = await prisma.transaction.findMany({ where: { deletedAt: null } });
    const map: Record<string, { income: number; expense: number }> = {};
    tx.forEach(t => {
      const key = t.date.toISOString().slice(0,7); // YYYY-MM
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

app.get('/api/category', async (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    const tx = await prisma.transaction.findMany({ where: { deletedAt: null, type: 'EXPENSE' } });
    const map: Record<string, number> = {};
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

app.get('/api/monthly-compare', async (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) {
      return res.status(400).json({ error: 'month is required' });
    }
    const tx = await prisma.transaction.findMany({ where: { deletedAt: null } });
    const map: Record<string, { income: number; expense: number }> = {};
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
  console.log(`サーバー起動中: http://localhost:${PORT}`);
});

server.on('error', (err: any) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Start the app with a different PORT or free the port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});


