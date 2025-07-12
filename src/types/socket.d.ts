import { Server } from "socket.io";

declare global {
  namespace Express {
    interface Request {
      io?: Server;
      requestTimestamp?: string;
    }
  }
}

export interface SaleCreatedEvent {
  sale: {
    id: number;
    saleNumber: string;
    totalPrice: number;
    profit: number;
    qtySold: number;
    product: {
      id: number;
      name: string;
      category: string;
      price: number;
    };
    soldBy: {
      id: number;
      firstName: string;
      lastName: string;
    };
    customerName?: string;
    paymentMethod: string;
    salesDate: string;
    createdAt: string;
  };
  notification: {
    title: string;
    message: string;
    priority: "info" | "success" | "warning" | "error";
    autoHide: boolean;
    hideAfter?: number;
  };
  timestamp: string;
}

export interface SaleStatusUpdatedEvent {
  type: "approved" | "rejected";
  sale: {
    id: number;
    saleNumber: string;
    status: string;
    totalPrice: number;
    profit: number;
    product: {
      id: number;
      name: string;
      category: string;
    };
    soldBy: {
      id: number;
      firstName: string;
      lastName: string;
    };
    approvedBy?: {
      id: number;
      firstName: string;
      lastName: string;
    };
    rejectedBy?: {
      id: number;
      name: string;
    };
    approvedAt?: string;
    rejectedAt?: string;
    rejectionReason?: string;
    stockRestored?: number;
    notes?: string;
  };
  notification: {
    title: string;
    message: string;
    reason?: string;
    amount?: number;
    profit?: number;
    stockRestored?: number;
    priority: "success" | "warning" | "error";
    autoHide: boolean;
    actions?: string[];
  };
  timestamp: string;
}

export interface PendingCountUpdatedEvent {
  count: number;
  action: "new_sale" | "approved" | "rejected" | "bulk_approved";
  saleNumber?: string;
  difference?: number;
  successCount?: number;
  failureCount?: number;
}

export interface BulkApprovalCompletedEvent {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  approvedBy: string;
  newPendingCount: number;
  timestamp: string;
}

export interface SaleApprovedBroadcastEvent {
  saleId: number;
  saleNumber: string;
  approvedBy: string;
  amount: number;
  employeeName: string;
  productName: string;
  timestamp: string;
}

export interface SaleRejectedBroadcastEvent {
  saleId: number;
  saleNumber: string;
  rejectedBy: string;
  reason: string;
  amount: number;
  employeeName: string;
  productName: string;
  stockRestored: number;
  timestamp: string;
}

export interface UserJoinSalesRoomData {
  userId: number;
  role: string;
  firstName?: string;
  lastName?: string;
}

export interface DashboardStatsRequest {
  userId?: number;
  role?: string;
}

export interface DashboardStatsResponse {
  pending?: {
    sales: number;
    urgent: number;
  };
  today?: {
    approved: number;
    revenue: number;
    revenueFormatted: string;
  };
  todayMySales?: number;
  myPendingSales?: number;
  myApprovedToday?: number;
  inventory?: {
    criticalStock: number;
  };
  employees?: {
    active: number;
  };
  recentActivity?: Array<{
    id: number;
    saleNumber: string;
    employeeName: string;
    productName: string;
    amount: number;
    age: number;
  }>;
  role: "admin" | "employee";
  realTime: {
    socketConnected: boolean;
    lastUpdated: string;
    autoRefresh: boolean;
  };
}

// Socket.io Server-to-Client Events
export interface ServerToClientEvents {
  // Connection events
  connection_success: (data: { message: string; socketId: string }) => void;
  test_response: (data: { message: string; receivedData: any; timestamp: string }) => void;
  
  // Sales room events
  sales_room_joined: (data: { success: boolean; room?: string; userId?: number; role?: string; message?: string; error?: string }) => void;
  
  // Initial data events
  initial_pending_count: (data: { count: number; message: string }) => void;
  recent_sales_status: (data: { sales: any[]; message: string }) => void;
  
  // Sale creation events
  new_sale_pending: (data: SaleCreatedEvent) => void;
  sale_created_success: (data: SaleCreatedEvent) => void;
  
  // Sale status update events
  sale_status_updated: (data: SaleStatusUpdatedEvent) => void;
  sale_approved_broadcast: (data: SaleApprovedBroadcastEvent) => void;
  sale_rejected_broadcast: (data: SaleRejectedBroadcastEvent) => void;
  
  // Count and bulk operation events
  pending_count_updated: (data: PendingCountUpdatedEvent) => void;
  bulk_approval_completed: (data: BulkApprovalCompletedEvent) => void;
  pending_sale_removed: (data: { saleId: number; action: string; timestamp: string }) => void;
  
  // User status events
  admin_online: (data: { adminId: number; name: string; timestamp: string }) => void;
  admin_offline: (data: { adminId: number; name: string; timestamp: string }) => void;
  user_offline: (data: { userId: number }) => void;
  
  // Test and system events
  admin_socket_test: (data: { message: string; adminId: number; timestamp: string }) => void;
  sales_socket_test: (data: { message: string; userId: number; userRole: string; timestamp: string }) => void;
  notification_preferences_updated: (data: { preferences: any; timestamp: string }) => void;
}

// Socket.io Client-to-Server Events  
export interface ClientToServerEvents {
  // Connection and room management
  join_sales_room: (userData: UserJoinSalesRoomData) => void;
  disconnect_user: () => void;
  
  // Test events
  test_event: (data: any) => void;
  
  // Sales data requests
  request_sales_update: (filters: { status?: string; limit?: number }, callback: (response: { success: boolean; data?: any[]; count?: number; timestamp?: string; error?: string }) => void) => void;
  request_dashboard_stats: (callback: (response: { success: boolean; data?: DashboardStatsResponse; timestamp?: string; error?: string }) => void) => void;
  
  // Real-time approval/rejection
  approve_sale_realtime: (data: { saleId: number; notes?: string }, callback: (response: { success: boolean; data?: any; message?: string; pendingCount?: number; error?: string; details?: string }) => void) => void;
  reject_sale_realtime: (data: { saleId: number; reason: string }, callback: (response: { success: boolean; data?: any; message?: string; pendingCount?: number; error?: string; details?: string }) => void) => void;
  
  // Bulk operations
  bulk_approve_sales: (data: { saleIds: number[]; notes?: string }, callback: (response: { success: boolean; message?: string; results?: any[]; pendingCount?: number; error?: string }) => void) => void;
}

// Socket.io Inter-Server Events (for scaling)
export interface InterServerEvents {
  ping: () => void;
}

// Socket.io Socket Data
export interface SocketData {
  user?: {
    userId: number;
    role: string;
    firstName?: string;
    lastName?: string;
    organization?: {
      id: number;
    };
  };
}