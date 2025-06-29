import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm"
import { Product } from "./Product"

export interface ProductTypeData {
  id: string
  name: string
  description?: string
}

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: "varchar", length: 255 })
  name: string

  @Column({ type: "text", nullable: true })
  description?: string

  @Column({ type: "json", default: "[]" })
  productTypes: ProductTypeData[]

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
