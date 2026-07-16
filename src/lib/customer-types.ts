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
  pickupPrice?: string | null;
  storefrontPrice?: string | null;
  sellDelivery?: boolean;
  sellPickup?: boolean;
  sellStorefront?: boolean;
  promoEnabled?: boolean;
  promoType?: "AMOUNT" | "PERCENT" | null;
  promoValue?: string | null;
  promoContinuous?: boolean;
  promoStartsAt?: string | null;
  promoEndsAt?: string | null;
  description: string | null;
  category: { id: string; name: string; sortOrder: number } | null;
  imageUrl: string | null;
  isOutOfStock: boolean;
  /** Top sellers from completed orders at this branch */
  isBestSeller?: boolean;
  optionGroups: MenuOptionGroupData[];
};

export type BranchData = {
  id: string;
  code: string | null;
  name: string;
  nameTh?: string | null;
  nameEn?: string | null;
  imageUrl: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone: string | null;
  primaryCategory?: string | null;
  secondaryCategories?: string[];
  priceRange?: string | null;
  ownerMessage?: string | null;
  extraMessage?: string | null;
  isOpen: boolean;
  /** @deprecated Prefer storefrontHours */
  opensAt: string | null;
  /** @deprecated Prefer deliveryHours / storefrontHours */
  closesAt: string | null;
  storefrontHours?: unknown;
  deliveryHours?: unknown;
  allowAdvanceOrder: boolean;
  autoAcceptOrders?: boolean;
  brand: {
    id: string;
    code: string;
    name: string;
    nameTh?: string | null;
    nameEn?: string | null;
    logoUrl: string | null;
    coverImageUrl?: string | null;
    color?: string | null;
    contactPhone?: string | null;
  } | null;
  menuItems: MenuItemData[];
  deliveryLocations: {
    id: string;
    name: string;
    deliveryFee: string;
    address?: string | null;
  }[];
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
