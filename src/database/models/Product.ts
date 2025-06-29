import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm"
import { Category } from "./Category"
import { Sale } from "./Sale"
import { StockMovement } from "./StockMovement"

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  name: string

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price: number

  @Column({ type: "decimal", precision: 10, scale: 2 })
  costPrice: number

  @Column({ default: 0 })
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

  // Store product type as simple fields instead of relation
  @Column()
  productTypeId: string

  @Column()
  productTypeName: string

  // New profit tracking fields
  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalProfit: number

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
  totalSales: number

  @Column({ default: 10 })
  minStockLevel: number

  @Column({ nullable: true })
  lastSaleDate?: Date

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Relationships
  @ManyToOne(
    () => Category,
    (category) => category.products,
    {
      onDelete: "RESTRICT",
    },
  )
  @JoinColumn({ name: "categoryId" })
  category: Category

  @OneToMany(
    () => Sale,
    (sale) => sale.product,
  )
  sales: Sale[]

  @OneToMany(
    () => StockMovement,
    (stockMovement) => stockMovement.product,
  )
  stockMovements: StockMovement[]

  // Virtual properties (getters)
  get profitMargin(): number {
    if (this.price === 0) return 0
    return ((this.price - this.costPrice) / this.price) * 100
  }

  get inventoryValue(): number {
    return this.qtyInStock * this.costPrice
  }

  get potentialProfit(): number {
    return this.qtyInStock * (this.price - this.costPrice)
  }

  get isLowStock(): boolean {
    return this.qtyInStock <= this.minStockLevel
  }
}
