import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { UserRole } from "../../Enums/UserRole";
import { Sale } from "./Sale";
import { StockMovement } from "./StockMovement";
import { Product } from "./Product";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  telephone: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.EMPLOYEE,
  })
  role: UserRole;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: true })
  isFirstLogin: boolean;

  @Column({ default: false })
  is2FAEnabled: boolean;

  @Column({ default: 0 })
  otpAttempts: number;

  @Column({ nullable: true })
  otpSecret?: string;

  @Column({ nullable: true })
  lastLoginAt?: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  resetPasswordToken?: string;

  @Column({ nullable: true })
  resetPasswordExpires?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToMany(() => Sale, (sale) => sale.soldBy)
  salesMade: Sale[];
  
  @OneToMany(() => Product, (product) => product.createdBy)
  productsCreated: Product[];
  @OneToMany(() => Sale, (sale) => sale.approvedBy)
  salesApproved: Sale[];

  @OneToMany(() => StockMovement, (stockMovement) => stockMovement.recordedBy)
  stockMovements: StockMovement[];
}