import type {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
} from "@prisma/client";

export type MenuOptionData = {
  id: string;
  name: string;
  priceDelta: string;
};

export type MenuOptionGroupData = {
  id: string;
  name: string;
  required: boolean;
  maxSelect: number;
  options: MenuOptionData[];
};

export type MenuItemData = {
  id: string;
  name: string;
  price: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  isOutOfStock: boolean;
  optionGroups: MenuOptionGroupData[];
};

export type BranchData = {
  id: string;
  code: string | null;
  name: string;
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  allowAdvanceOrder: boolean;
  brand: { id: string; code: string; name: string; logoUrl: string | null } | null;
  menuItems: MenuItemData[];
  deliveryLocations: { id: string; name: string }[];
};

export type CartLine = {
  key: string;
  branchMenuItemId: string;
  name: string;
  unitPrice: number;
  optionIds: string[];
  optionNames: string[];
  optionsPrice: number;
  note?: string;
  quantity: number;
};

export type OrderItemData = {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: string;
  optionsText: string | null;
  optionsPrice: string;
  note: string | null;
  branchMenuItem?: { imageUrl: string | null } | null;
};

export type OrderData = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  addressDetail: string | null;
  scheduledAt: string | null;
  note: string | null;
  deliveryFee: string;
  discountAmount: string;
  createdAt: string;
  branch: { id: string; name: string; imageUrl?: string | null };
  deliveryLocation: { id: string; name: string } | null;
  items: OrderItemData[];
};

export function lineTotal(line: CartLine): number {
  return (line.unitPrice + line.optionsPrice) * line.quantity;
}

export function orderItemsTotal(items: OrderItemData[]): number {
  return items.reduce(
    (sum, it) =>
      sum + (Number(it.unitPrice) + Number(it.optionsPrice)) * it.quantity,
    0,
  );
}

export function orderGrandTotal(order: OrderData): number {
  return (
    orderItemsTotal(order.items) +
    Number(order.deliveryFee) -
    Number(order.discountAmount)
  );
}
