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

    res.render("index", { transactions, totalIncome, totalExpense, balance, deletedTransactions });
  } catch (error) {
    console.error(error);
    res.status(500).send("エラーが発生しました。");
  }
});

// ② 家計簿データの追加処理
app.post("/transactions", async (req: Request, res: Response) => {
  const { title, amount, type, category } = req.body;
  
  if (title && amount && type && category) {
    try {
      await prisma.transaction.create({
        data: {
          title: title,
          amount: parseInt(amount, 10), // 金額を数値に変換
          type: type,
          category: category,
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


