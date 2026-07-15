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
    // データベースから新しい順にすべての取引データを取得
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' }
    });
    
    // 収入と支出の合計を計算
    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;

    res.render("index", { transactions, totalIncome, totalExpense, balance });
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


