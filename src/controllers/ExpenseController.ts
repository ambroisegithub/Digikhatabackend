// @ts-nocheck

import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import { Between } from "typeorm"
import dbConnection from "../database"
import { MonthlyExpense } from "../database/models/MonthlyExpense"
import { Sale } from "../database/models/Sale"

const formatCurrency = (amount: number, currency: string = "RWF"): string => {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

const formatNumber = (value: number): number => {
  return Number(parseFloat(value.toString()).toFixed(2))
}

const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`
}

const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
}

export class ExpenseController {
  static async addMonthlyExpense(req: Request, res: Response) {
    try {
      debugLog("ADD_MONTHLY_EXPENSE - Request", {
        body: req.body,
        userId: req.userId,
        userRole: req.user?.role,
      })

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const {
        description,
        amount,
        category,
        expenseDate,
        notes,
        receiptNumber,
        vendor,
        isRecurring = false
      } = req.body

      const user = req.user
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        })
      }

      const expenseRepository = dbConnection.getRepository(MonthlyExpense)
      
      const parsedDate = new Date(expenseDate)
      const expenseMonth = parsedDate.getMonth() + 1 
      const expenseYear = parsedDate.getFullYear()

      const expense = expenseRepository.create({
        description,
        amount: formatNumber(amount),
        category,
        expenseDate: parsedDate,
        expenseMonth,
        expenseYear,
        notes,
        receiptNumber,
        vendor,
        isRecurring,
        recordedBy: user,
      })

      await expenseRepository.save(expense)

      const completeExpense = await expenseRepository.findOne({
        where: { id: expense.id },
        relations: ["recordedBy"],
      })

      debugLog("ADD_MONTHLY_EXPENSE - Success", {
        expenseId: expense.id,
        amount: expense.amount,
        category: expense.category,
        recordedBy: user.id,
      })

      return res.status(201).json({
        success: true,
        message: "Monthly expense added successfully",
        timestamp: new Date().toISOString(),
        data: {
          ...completeExpense,
          amountFormatted: formatCurrency(Number(completeExpense.amount)),
          recordedBy: {
            id: completeExpense.recordedBy.id,
            username: completeExpense.recordedBy.username,
            firstName: completeExpense.recordedBy.firstName,
            lastName: completeExpense.recordedBy.lastName,
          }
        },
      })
    } catch (error) {
      debugLog("ADD_MONTHLY_EXPENSE - Error", error)
      console.error("Add monthly expense error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to add monthly expense",
        timestamp: new Date().toISOString()
      })
    }
  }


  static async getExpensesSummary(req: Request, res: Response) {
    try {
      debugLog("GET_EXPENSES_SUMMARY - Request", {
        query: req.query,
        userId: req.userId,
        userRole: req.user?.role,
      })

      const {
        month,
        year,
        currency = "RWF",
        includeCalendarView = "true",
        includeTransactionDetails = "true"
      } = req.query

      const expenseRepository = dbConnection.getRepository(MonthlyExpense)
      const saleRepository = dbConnection.getRepository(Sale)

      const currentDate = new Date()
      const targetMonth = month ? parseInt(month as string) : currentDate.getMonth() + 1
      const targetYear = year ? parseInt(year as string) : currentDate.getFullYear()

      const startOfMonth = new Date(targetYear, targetMonth - 1, 1)
      const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59)

      const monthlyExpenses = await expenseRepository.find({
        where: {
          expenseMonth: targetMonth,
          expenseYear: targetYear,
        },
        relations: ["recordedBy"],
        order: { expenseDate: "DESC" },
      })

      const monthlySales = await saleRepository.find({
        where: {
          salesDate: Between(startOfMonth, endOfMonth),
          status: "approved",
        },
        relations: ["soldBy", "product"],
        order: { salesDate: "DESC" },
      })

      const grossRevenue = monthlySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalCost = monthlySales.reduce((sum, sale) => sum + Number(sale.totalCost), 0)
      const grossProfit = grossRevenue - totalCost

      const totalExpenses = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)

      const netIncome = grossProfit - totalExpenses

      const expensesByCategory = monthlyExpenses.reduce((acc, expense) => {
        const category = expense.category
        if (!acc[category]) {
          acc[category] = {
            category,
            totalAmount: 0,
            count: 0,
            expenses: []
          }
        }
        acc[category].totalAmount += Number(expense.amount)
        acc[category].count += 1
        acc[category].expenses.push({
          id: expense.id,
          description: expense.description,
          amount: Number(expense.amount),
          amountFormatted: formatCurrency(Number(expense.amount), currency as string),
          date: expense.expenseDate,
          vendor: expense.vendor,
          receiptNumber: expense.receiptNumber,
        })
        return acc
      }, {})

      const categoryBreakdown = Object.values(expensesByCategory).map((category: any) => ({
        ...category,
        totalAmountFormatted: formatCurrency(category.totalAmount, currency as string),
        averageAmount: formatNumber(category.totalAmount / category.count),
        averageAmountFormatted: formatCurrency(category.totalAmount / category.count, currency as string)
      })).sort((a: any, b: any) => b.totalAmount - a.totalAmount)

let calendarData = {}
if (includeCalendarView === "true") {
  calendarData = monthlyExpenses.reduce((acc, expense) => {
    const dateKey = new Date(expense.expenseDate).toISOString().split("T")[0] // Fixed here
    if (!acc[dateKey]) {
      acc[dateKey] = {
        date: dateKey,
        totalAmount: 0,
        expenseCount: 0,
        expenses: []
      }
    }
    acc[dateKey].totalAmount += Number(expense.amount)
    acc[dateKey].expenseCount += 1
    acc[dateKey].expenses.push({
      id: expense.id,
      description: expense.description,
      amount: Number(expense.amount),
      amountFormatted: formatCurrency(Number(expense.amount), currency as string),
      category: expense.category
    })
    return acc
  }, {})
}

let transactionDetails = []
if (includeTransactionDetails === "true") {
  transactionDetails = monthlyExpenses.map(expense => ({
    id: expense.id,
    type: "expense",
    description: expense.description,
    amount: Number(expense.amount),
    amountFormatted: formatCurrency(Number(expense.amount), currency as string),
    category: expense.category,
    date: new Date(expense.expenseDate), // Fixed here
    vendor: expense.vendor,
    receiptNumber: expense.receiptNumber,
    recordedBy: `${expense.recordedBy.firstName} ${expense.recordedBy.lastName}`,
    isRecurring: expense.isRecurring
  }))
}

      const expenseToRevenueRatio = grossRevenue > 0 ? (totalExpenses / grossRevenue) * 100 : 0
      const profitMargin = grossRevenue > 0 ? (netIncome / grossRevenue) * 100 : 0

      const summary = {
        period: {
          month: targetMonth,
          year: targetYear,
          monthName: new Date(targetYear, targetMonth - 1).toLocaleDateString('en-US', { month: 'long' }),
          daysInMonth: new Date(targetYear, targetMonth, 0).getDate()
        },
        currency: currency as string,
        reportGeneratedAt: new Date().toISOString(),

        grossRevenue: formatNumber(grossRevenue),
        grossRevenueFormatted: formatCurrency(grossRevenue, currency as string),
        grossProfit: formatNumber(grossProfit),
        grossProfitFormatted: formatCurrency(grossProfit, currency as string),
        totalExpenses: formatNumber(totalExpenses),
        totalExpensesFormatted: formatCurrency(totalExpenses, currency as string),
        netIncome: formatNumber(netIncome),
        netIncomeFormatted: formatCurrency(netIncome, currency as string),

        totalSalesTransactions: monthlySales.length,
        totalExpenseEntries: monthlyExpenses.length,

        profitMargin: formatNumber(profitMargin),
        profitMarginFormatted: formatPercentage(profitMargin),
        expenseToRevenueRatio: formatNumber(expenseToRevenueRatio),
        expenseToRevenueRatioFormatted: formatPercentage(expenseToRevenueRatio),

        // Performance indicators
        isProfit: netIncome > 0,
        performanceStatus: netIncome > 0 ? "Profitable" : netIncome === 0 ? "Break-even" : "Loss",
        
        // Breakdown data
        categoryBreakdown,

        // Additional insights
        insights: {
          averageExpensePerDay: formatNumber(totalExpenses / new Date(targetYear, targetMonth, 0).getDate()),
          averageExpensePerDayFormatted: formatCurrency(totalExpenses / new Date(targetYear, targetMonth, 0).getDate(), currency as string),
          largestExpenseCategory: categoryBreakdown[0]?.category || "No expenses",
          largestExpenseAmount: categoryBreakdown[0]?.totalAmount || 0,
          largestExpenseAmountFormatted: categoryBreakdown[0]?.totalAmountFormatted || formatCurrency(0, currency as string)
        },

        ...(includeCalendarView === "true" && { calendarData }),
        ...(includeTransactionDetails === "true" && { transactionDetails })
      }

      debugLog("GET_EXPENSES_SUMMARY - Result", {
        targetMonth,
        targetYear,
        grossProfit,
        totalExpenses,
        netIncome,
        expenseCount: monthlyExpenses.length,
        salesCount: monthlySales.length,
      })

      return res.json({
        success: true,
        message: "Monthly financial summary retrieved successfully",
        timestamp: new Date().toISOString(),
        data: summary,
      })
    } catch (error) {
      debugLog("GET_EXPENSES_SUMMARY - Error", error)
      console.error("Get expenses summary error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch expenses summary",
        timestamp: new Date().toISOString()
      })
    }
  }
}