// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Category } from "../database/models/Category"

export class CategoryController {
  // Get all categories
  static async getCategories(req: Request, res: Response) {
    try {
      const categoryRepository = dbConnection.getRepository(Category)
      const categories = await categoryRepository.find({
        order: { name: "ASC" },
      })

      return res.json({
        success: true,
        message: "Categories retrieved successfully",
        data: categories,
      })
    } catch (error) {
      console.error("Get categories error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch categories",
      })
    }
  }

  // Get category by ID
  static async getCategoryById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const categoryRepository = dbConnection.getRepository(Category)

      const category = await categoryRepository.findOne({
        where: { id: Number(id) },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      return res.json({
        success: true,
        message: "Category retrieved successfully",
        data: category,
      })
    } catch (error) {
      console.error("Get category error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch category",
      })
    }
  }

  // Create category
  static async createCategory(req: Request, res: Response) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const categoryRepository = dbConnection.getRepository(Category)
      const { name, description, productTypes = [] } = req.body

      // Check if category already exists
      const existingCategory = await categoryRepository.findOne({
        where: { name },
      })

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        })
      }

      // Create category
      const category = categoryRepository.create({
        name,
        description,
        productTypes,
      })

      await categoryRepository.save(category)

      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category,
      })
    } catch (error) {
      console.error("Create category error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to create category",
      })
    }
  }

  // Update category
  static async updateCategory(req: Request, res: Response) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const categoryRepository = dbConnection.getRepository(Category)
      const { name, description, productTypes } = req.body

      const category = await categoryRepository.findOne({
        where: { id: Number(id) },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      // Update category
      if (name) category.name = name
      if (description !== undefined) category.description = description
      if (productTypes) category.productTypes = productTypes

      await categoryRepository.save(category)

      return res.json({
        success: true,
        message: "Category updated successfully",
        data: category,
      })
    } catch (error) {
      console.error("Update category error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to update category",
      })
    }
  }

  // Delete category
  static async deleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params
      const categoryRepository = dbConnection.getRepository(Category)

      const category = await categoryRepository.findOne({
        where: { id: Number(id) },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      await categoryRepository.remove(category)

      return res.json({
        success: true,
        message: "Category deleted successfully",
      })
    } catch (error) {
      console.error("Delete category error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to delete category",
      })
    }
  }

  // Add product type to category
  static async addProductType(req: Request, res: Response) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { categoryId } = req.params
      const categoryRepository = dbConnection.getRepository(Category)
      const { name, description } = req.body

      const category = await categoryRepository.findOne({
        where: { id: Number(categoryId) },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      // Generate new product type ID
      const newProductType = {
        id: Date.now().toString(),
        name,
        description,
      }

      // Add to existing product types
      category.productTypes = [...(category.productTypes || []), newProductType]
      await categoryRepository.save(category)

      return res.status(201).json({
        success: true,
        message: "Product type added successfully",
        data: newProductType,
      })
    } catch (error) {
      console.error("Add product type error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to add product type",
      })
    }
  }

  // Update product type
  static async updateProductType(req: Request, res: Response) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { categoryId, productTypeId } = req.params
      const categoryRepository = dbConnection.getRepository(Category)
      const { name, description } = req.body

      const category = await categoryRepository.findOne({
        where: { id: Number(categoryId) },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      // Find and update product type
      const productTypeIndex = category.productTypes.findIndex((pt) => pt.id === productTypeId)
      if (productTypeIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Product type not found",
        })
      }

      if (name) category.productTypes[productTypeIndex].name = name
      if (description !== undefined) category.productTypes[productTypeIndex].description = description

      await categoryRepository.save(category)

      return res.json({
        success: true,
        message: "Product type updated successfully",
        data: category.productTypes[productTypeIndex],
      })
    } catch (error) {
      console.error("Update product type error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to update product type",
      })
    }
  }

  // Delete product type
  static async deleteProductType(req: Request, res: Response) {
    try {
      const { categoryId, productTypeId } = req.params
      const categoryRepository = dbConnection.getRepository(Category)

      const category = await categoryRepository.findOne({
        where: { id: Number(categoryId) },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      // Remove product type
      category.productTypes = category.productTypes.filter((pt) => pt.id !== productTypeId)
      await categoryRepository.save(category)

      return res.json({
        success: true,
        message: "Product type deleted successfully",
      })
    } catch (error) {
      console.error("Delete product type error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to delete product type",
      })
    }
  }
}
