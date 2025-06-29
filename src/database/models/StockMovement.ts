import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm"
import { Product } from "./Product"
import { User } from "./User"

export type StockMovementType = "in" | "out"

@Entity("stock_movements")
export class StockMovement {
  @PrimaryGeneratedColumn()
  id: number

  @Column({
    type: "enum",
    enum: ["in", "out"],
  })
  type: StockMovementType

  @Column()
  quantity: number

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  costPrice?: number

  @Column({ type: "text" })
  reason: string

  @Column()
  movementDate: Date

  @Column({ type: "text", nullable: true })
  notes?: string

  @CreateDateColumn()
  createdAt: Date

  // Relationships
  @ManyToOne(() => Product, (product) => product.stockMovements, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "productId" })
  product: Product

  @ManyToOne(() => User, (user) => user.stockMovements, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "recordedById" })
  recordedBy: User
}