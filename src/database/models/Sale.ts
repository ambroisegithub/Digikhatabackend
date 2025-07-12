import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { Product } from "./Product"
import { User } from "./User"

export type SaleStatus = "pending" | "approved" | "rejected"
export type PaymentMethod = "cash" | "card" | "mobile" | "credit"

@Entity("sales")
export class Sale {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true })
  saleNumber: string

  @Column()
  qtySold: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  unitPrice: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  unitCost: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  totalPrice: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  totalCost: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  profit: number

  @Column({
    type: "enum",
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  })
  status: SaleStatus

  @Column({
    type: "enum",
    enum: ["cash", "card", "mobile", "credit"],
    default: "cash",
  })
  paymentMethod: PaymentMethod

  @Column({ nullable: true })
  customerName?: string

  @Column({ nullable: true })
  customerPhone?: string

  @Column()
  salesDate: Date

  @Column({ type: "text", nullable: true })
  notes?: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Relationships
  @ManyToOne(
    () => Product,
    (product) => product.sales,
    {
      onDelete: "RESTRICT",
    },
  )
  @JoinColumn({ name: "productId" })
  product: Product

  @ManyToOne(
    () => User,
    (user) => user.salesMade,
    {
      onDelete: "RESTRICT",
    },
  )
  @JoinColumn({ name: "soldById" })
  soldBy: User

  @ManyToOne(
    () => User,
    (user) => user.salesApproved,
    {
      nullable: true,
      onDelete: "SET NULL",
    },
  )
  @JoinColumn({ name: "approvedById" })
  approvedBy?: User

  @Column({ nullable: true })
  employeeNotes?: string;
}
