import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Category, type ProductTypeData } from "../database/models/Category"
import { Product } from "../database/models/Product"
import { v4 as uuidv4 } from "uuid"

export class CategoryController {
  // Create a new category with product types
  static async createCategory(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const categoryRepository = dbConnection.getRepository(Category)
      const { name, description, productTypes = [] } = req.body

      // Check for existing category
      const existingCategory = await categoryRepository.findOne({ where: { name } })
      if (existingCategory) {
        return res.status(400).json({ message: "Category already exists" })
      }

      // Process product types - add IDs if not present
      const processedProductTypes: ProductTypeData[] = productTypes.map((pt: any) => ({
        id: pt.id || uuidv4(),
        name: pt.name,
        description: pt.description || undefined,
      }))

      const category = categoryRepository.create({
        name,
        description,
        productTypes: processedProductTypes,
      })

      await categoryRepository.save(category)

      return res.status(201).json({
        message: "Category created successfully",
        data: category,
      })
    } catch (error) {
      console.error("Error creating category:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // List all categories with product types
  static async listCategories(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)

      const categories = await categoryRepository.find({
        relations: ["products"],
        order: { name: "ASC" },
      })

      return res.status(200).json({
        message: "Categories retrieved successfully",
        count: categories.length,
        data: categories,
      })
    } catch (error) {
      console.error("Error listing categories:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Get a single category with its product types
  static async getCategory(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)
      const categoryId = Number.parseInt(req.params.id)

      const category = await categoryRepository.findOne({
        where: { id: categoryId },
        relations: ["products"],
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      return res.status(200).json({
        message: "Category retrieved successfully",
        data: category,
      })
    } catch (error) {
      console.error("Error getting category:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Update a category and its product types
  static async updateCategory(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const categoryRepository = dbConnection.getRepository(Category)
      const categoryId = Number.parseInt(req.params.id)

      // Check if category exists
      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      const { name, description, productTypes } = req.body

      // Check if another category with the same name exists
      if (name && name !== category.name) {
        const existingCategory = await categoryRepository.findOne({
          where: { name },
        })
        if (existingCategory) {
          return res.status(400).json({
            message: "Another category with this name already exists",
          })
        }
      }

      // Update category fields
      category.name = name || category.name
      category.description = description !== undefined ? description : category.description

      // Update product types if provided
      if (productTypes !== undefined) {
        const processedProductTypes: ProductTypeData[] = productTypes.map((pt: any) => ({
          id: pt.id || uuidv4(),
          name: pt.name,
          description: pt.description || undefined,
        }))
        category.productTypes = processedProductTypes
      }

      await categoryRepository.save(category)

      return res.status(200).json({
        message: "Category updated successfully",
        data: category,
      })
    } catch (error) {
      console.error("Error updating category:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Add product type to category
  static async addProductType(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)
      const categoryId = Number.parseInt(req.params.id)
      const { name, description } = req.body

      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      // Check if product type name already exists in this category
      const existingProductType = category.productTypes.find((pt) => pt.name === name)
      if (existingProductType) {
        return res.status(400).json({
          message: "Product type with this name already exists in this category",
        })
      }

      const newProductType: ProductTypeData = {
        id: uuidv4(),
        name,
        description,
      }

      category.productTypes = [...category.productTypes, newProductType]
      await categoryRepository.save(category)

      return res.status(201).json({
        message: "Product type added successfully",
        data: newProductType,
      })
    } catch (error) {
      console.error("Error adding product type:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Update product type in category
  static async updateProductType(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)
      const categoryId = Number.parseInt(req.params.id)
      const productTypeId = req.params.productTypeId
      const { name, description } = req.body

      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      const productTypeIndex = category.productTypes.findIndex((pt) => pt.id === productTypeId)
      if (productTypeIndex === -1) {
        return res.status(404).json({ message: "Product type not found" })
      }

      // Check if another product type with the same name exists
      const existingProductType = category.productTypes.find(
        (pt, index) => pt.name === name && index !== productTypeIndex,
      )
      if (existingProductType) {
        return res.status(400).json({
          message: "Another product type with this name already exists in this category",
        })
      }

      category.productTypes[productTypeIndex] = {
        ...category.productTypes[productTypeIndex],
        name: name || category.productTypes[productTypeIndex].name,
        description: description !== undefined ? description : category.productTypes[productTypeIndex].description,
      }

      await categoryRepository.save(category)

      return res.status(200).json({
        message: "Product type updated successfully",
        data: category.productTypes[productTypeIndex],
      })
    } catch (error) {
      console.error("Error updating product type:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Delete product type from category
  static async deleteProductType(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)
      const productRepository = dbConnection.getRepository(Product)
      const categoryId = Number.parseInt(req.params.id)
      const productTypeId = req.params.productTypeId

      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      const productTypeIndex = category.productTypes.findIndex((pt) => pt.id === productTypeId)
      if (productTypeIndex === -1) {
        return res.status(404).json({ message: "Product type not found" })
      }

      // Check if any products use this product type
      const productsUsingType = await productRepository.find({
        where: { productTypeId },
      })

      if (productsUsingType.length > 0) {
        return res.status(400).json({
          message: "Cannot delete product type with associated products",
          productsCount: productsUsingType.length,
        })
      }

      category.productTypes = category.productTypes.filter((pt) => pt.id !== productTypeId)
      await categoryRepository.save(category)

      return res.status(200).json({
        message: "Product type deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting product type:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Delete a category
  static async deleteCategory(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)
      const productRepository = dbConnection.getRepository(Product)
      const categoryId = Number.parseInt(req.params.id)

      // Check if category exists
      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      // Check if category has associated products
      const products = await productRepository.find({
        where: { category: { id: categoryId } },
      })

      if (products.length > 0) {
        return res.status(400).json({
          message: "Cannot delete category with associated products",
          productsCount: products.length,
        })
      }

      // Delete category
      await categoryRepository.remove(category)

      return res.status(200).json({
        message: "Category deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting category:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }
}
