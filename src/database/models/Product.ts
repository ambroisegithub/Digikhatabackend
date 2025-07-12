import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm"
import { Category } from "./Category"
import { User } from "./User"
import { Sale } from "./Sale"
import { StockMovement } from "./StockMovement"

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  name: string

  @ManyToOne(() => Category, { nullable: false })
  @JoinColumn({ name: "categoryId" })
  category: Category

  @Column()
  productTypeId: string

  @Column()
  productTypeName: string

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  costPrice: number

  @Column({ type: "int", default: 0 })
  qtyInStock: number

  @Column({ type: "text", nullable: true })
  description?: string

  @Column({ unique: true, nullable: true })
  sku?: string

  @Column({ nullable: true })
  size?: string

  @Column({ nullable: true })
  color?: string

  @Column({ type: "text", nullable: true })
  otherAttributes?: string

  @Column({ type: "int", default: 10 })
  minStockLevel: number

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalProfit: number

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalSales: number

  @Column({ type: "timestamp", nullable: true })
  lastSaleDate?: Date

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "createdById" })
  createdBy: User

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Relationships
  @OneToMany(
    () => Sale,
    (sale) => sale.product,
  )
  sales: Sale[]

  @OneToMany(
    () => StockMovement,
    (movement) => movement.product,
  )
  stockMovements: StockMovement[]
}
