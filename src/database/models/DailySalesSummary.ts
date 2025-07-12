// @ts-nocheck
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { User } from "./User"

@Entity("daily_sales_summaries")
export class DailySalesSummary {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: "date" })
  date: Date

  @ManyToOne(() => User, { nullable: false })
  employee: User

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalSales: number

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalProfit: number

  @Column({ type: "int", default: 0 })
  totalTransactions: number

  @Column({ type: "int", default: 0 })
  approvedSales: number

  @Column({ type: "int", default: 0 })
  pendingSales: number

  @Column({ type: "int", default: 0 })
  rejectedSales: number

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  avgSaleValue: number

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  profitMargin: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
