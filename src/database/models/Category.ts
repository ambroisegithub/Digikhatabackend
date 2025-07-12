import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { Product } from "./Product"

export interface ProductType {
  id: string
  name: string
  description?: string
}

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true })
  name: string

  @Column({ type: "text", nullable: true })
  description?: string

  @Column({ type: "json", default: [] })
  productTypes: ProductType[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Relationships
  @OneToMany(
    () => Product,
    (product) => product.category,
  )
  products: Product[]
}
