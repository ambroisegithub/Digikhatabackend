import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { User } from "./User"

export type ExpenseCategory = 
  | "rent" 
  | "utilities" 
  | "marketing" 
  | "supplies" 
  | "maintenance" 
  | "transport" 
  | "insurance" 
  | "other"

@Entity("monthly_expenses")
export class MonthlyExpense {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  description: string

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: number

  @Column({
    type: "enum",
    enum: ["rent", "utilities", "marketing", "supplies", "maintenance", "transport", "insurance", "other"],
    default: "other",
  })
  category: ExpenseCategory

  @Column({ type: "date" })
  expenseDate: Date

  @Column({ type: "int" })
  expenseMonth: number // 1-12

  @Column({ type: "int" })
  expenseYear: number

  @Column({ type: "text", nullable: true })
  notes?: string

  @Column({ type: "varchar", nullable: true })
  receiptNumber?: string

  @Column({ type: "varchar", nullable: true })
  vendor?: string

  @Column({ default: true })
  isRecurring: boolean

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  
  @ManyToOne(
    () => User,
    (user) => user.expensesRecorded,
    {
      onDelete: "RESTRICT",
    },
  )
  @JoinColumn({ name: "recordedById" })
  recordedBy: User
}