// @ts-nocheck
import { Router } from "express"
import { CategoryController } from "../controllers/CategoryController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"
import { body, param } from "express-validator"

const router = Router()

// Validation rules for creating category
const createCategoryValidation = [
  body("name").notEmpty().trim().withMessage("Category name is required"),
  body("description").optional().trim(),
  body("productTypes").optional().isArray().withMessage("Product types must be an array"),
  body("productTypes.*.name").optional().notEmpty().trim().withMessage("Product type name is required"),
  body("productTypes.*.description").optional().trim(),
]

// Validation rules for updating category
const updateCategoryValidation = [
  param("id").isInt().withMessage("Category ID must be an integer"),
  body("name").optional().trim(),
  body("description").optional().trim(),
  body("productTypes").optional().isArray().withMessage("Product types must be an array"),
  body("productTypes.*.name").optional().notEmpty().trim().withMessage("Product type name is required"),
  body("productTypes.*.description").optional().trim(),
]

// Validation rules for product type operations
const productTypeValidation = [
  param("id").isInt().withMessage("Category ID must be an integer"),
  body("name").notEmpty().trim().withMessage("Product type name is required"),
  body("description").optional().trim(),
]

// Routes with authentication and authorization
router.post("/", authenticate, authorize([UserRole.ADMIN]), createCategoryValidation, CategoryController.createCategory)

router.get("/", authenticate, CategoryController.getCategories)

router.get(
  "/:id",
  authenticate,
  param("id").isInt().withMessage("Category ID must be an integer"),
  CategoryController.getCategoryById,
)

router.put(
  "/:id",
  authenticate,
  authorize([UserRole.ADMIN]),
  updateCategoryValidation,
  CategoryController.updateCategory,
)

router.delete(
  "/:id",
  authenticate,
  authorize([UserRole.ADMIN]),
  param("id").isInt().withMessage("Category ID must be an integer"),
  CategoryController.deleteCategory,
)

// Product type management within categories
router.post(
  "/:id/product-types",
  authenticate,
  authorize([UserRole.ADMIN]),
  productTypeValidation,
  CategoryController.addProductType,
)

router.put(
  "/:id/product-types/:productTypeId",
  authenticate,
  authorize([UserRole.ADMIN]),
  [
    param("id").isInt().withMessage("Category ID must be an integer"),
    param("productTypeId").notEmpty().withMessage("Product type ID is required"),
    body("name").notEmpty().trim().withMessage("Product type name is required"),
    body("description").optional().trim(),
  ],
  CategoryController.updateProductType,
)

router.delete(
  "/:id/product-types/:productTypeId",
  authenticate,
  authorize([UserRole.ADMIN]),
  [
    param("id").isInt().withMessage("Category ID must be an integer"),
    param("productTypeId").notEmpty().withMessage("Product type ID is required"),
  ],
  CategoryController.deleteProductType,
)

export default router
