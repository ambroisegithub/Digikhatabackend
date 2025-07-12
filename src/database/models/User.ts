import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm"
import { Product } from "./Product"
import { Sale } from "./Sale"
import { StockMovement } from "./StockMovement"
import { MonthlyExpense } from "./MonthlyExpense"
@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true })
  username: string

  @Column({ unique: true })
  email: string

  @Column()
  password: string

  @Column()
  firstName: string

  @Column()
  lastName: string

  @Column()
  telephone: string

  @Column({ type: "enum", enum: ["admin", "employee"], default: "employee" })
  role: string

  @Column({ default: true })
  isActive: boolean

  @Column({ default: false })
  isVerified: boolean

  @Column({ default: true })
  isFirstLogin: boolean

  @Column({ default: false })
  is2FAEnabled: boolean

  @Column({ default: 0 })
  otpAttempts: number

  @Column({ nullable: true })
  otpSecret?: string

  @Column({ nullable: true })
  lastLoginAt?: Date

  @Column({ nullable: true })
  resetPasswordToken?: string

  @Column({ nullable: true })
  resetPasswordExpires?: Date

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Relationships
  @OneToMany(
    () => Product,
    (product) => product.createdBy,
  )
  productsCreated: Product[]

  @OneToMany(
    () => Sale,
    (sale) => sale.soldBy,
  )
  salesMade: Sale[]

  @OneToMany(
    () => Sale,
    (sale) => sale.approvedBy,
  )
  salesApproved: Sale[]
@OneToMany(
  () => MonthlyExpense,
  (expense) => expense.recordedBy,
)
expensesRecorded: MonthlyExpense[]
  @OneToMany(
    () => StockMovement,
    (movement) => movement.recordedBy,
  )
  stockMovements: StockMovement[]
}
