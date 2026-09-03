import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Banknote,
  Bell,
  Boxes,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Filter,
  Gift,
  Home,
  Image,
  Landmark,
  LayoutGrid,
  Link2,
  List,
  Lock,
  LogOut,
  MapPin,
  Mic,
  Minus,
  Package,
  Pencil,
  Phone,
  PieChart,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Star,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  User,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import type { ComponentType, SVGProps, ReactNode } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function wrapLucide(Icon: LucideIcon) {
  function Wrapped({
    size = 20,
    className,
    strokeWidth = 2,
    ...props
  }: IconProps) {
    return (
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        className={className ? `block shrink-0 ${className}` : "block shrink-0"}
        aria-hidden={props["aria-hidden"] ?? true}
        {...props}
      />
    );
  }
  Wrapped.displayName = Icon.displayName ?? Icon.name;
  return Wrapped;
}

export const IconBack = wrapLucide(ChevronLeft);
export const IconClose = wrapLucide(X);
export const IconSearch = wrapLucide(Search);
export const IconFilter = wrapLucide(Filter);
export const IconCheck = wrapLucide(Check);
export const IconRefresh = wrapLucide(RefreshCw);
export const IconChevronRight = wrapLucide(ChevronRight);
export const IconChevronDown = wrapLucide(ChevronDown);
export const IconChevronUp = wrapLucide(ChevronUp);
export const IconArrowRight = wrapLucide(ArrowRight);
export const IconUser = wrapLucide(User);
export const IconPhone = wrapLucide(Phone);
export const IconPin = wrapLucide(MapPin);
export const IconClock = wrapLucide(Clock);
export const IconNote = wrapLucide(FileText);
export const IconStar = wrapLucide(Star);
export const IconStore = wrapLucide(Store);
export const IconDelivery = wrapLucide(Truck);
export const IconBag = wrapLucide(ShoppingBag);
export const IconCash = wrapLucide(Banknote);
export const IconBank = wrapLucide(Landmark);
export const IconCard = wrapLucide(CreditCard);
export const IconTrash = wrapLucide(Trash2);
export const IconEdit = wrapLucide(Pencil);
export const IconBell = wrapLucide(Bell);
export const IconVolume = wrapLucide(Volume2);
export const IconVolumeOff = wrapLucide(VolumeX);
export const IconPrinter = wrapLucide(Printer);
export const IconLogout = wrapLucide(LogOut);
export const IconMinus = wrapLucide(Minus);
export const IconPlus = wrapLucide(Plus);
export const IconQrScan = wrapLucide(ScanLine);
export const IconQrCode = wrapLucide(QrCode);
export const IconMic = wrapLucide(Mic);
export const IconLock = wrapLucide(Lock);
export const IconCalendar = wrapLucide(Calendar);
export const IconHome = wrapLucide(Home);
export const IconMoney = wrapLucide(CircleDollarSign);
export const IconPackage = wrapLucide(Package);
export const IconReceipt = wrapLucide(Receipt);
export const IconImage = wrapLucide(Image);
export const IconShare = wrapLucide(Share2);
export const IconCamera = wrapLucide(Camera);
export const IconUpload = wrapLucide(Upload);
export const IconListView = wrapLucide(List);
export const IconGridView = wrapLucide(LayoutGrid);
export const IconChart = wrapLucide(PieChart);
export const IconGear = wrapLucide(Settings);
export const IconGift = wrapLucide(Gift);
export const IconWallet = wrapLucide(Wallet);
export const IconTrend = wrapLucide(TrendingUp);
export const IconBoxes = wrapLucide(Boxes);
export const IconLink = wrapLucide(Link2);
export const IconCart = wrapLucide(ShoppingBag);
export const IconBasket = wrapLucide(ShoppingBasket);
export const IconKeyOrder = wrapLucide(ClipboardList);
export const IconClipboard = wrapLucide(ClipboardList);
export const IconWaste = wrapLucide(ShieldCheck);
export const IconChartBars = wrapLucide(TrendingUp);
export const IconExpense = wrapLucide(Receipt);
export const IconChevron = IconChevronRight;

/** ข้อความลิงก์ + ไอคอน > แทนลูกศรข้อความ */
export function IconLinkSuffix({
  children,
  className = "",
  iconClassName = "",
  size = 14,
}: {
  children: ReactNode;
  className?: string;
  iconClassName?: string;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {children}
      <ChevronRight
        size={size}
        className={`shrink-0 ${iconClassName}`}
        aria-hidden
      />
    </span>
  );
}

/** placeholder สำหรับรูปสาขา */
export function IconBranchPlaceholder({ size = 40, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="6" y="10" width="28" height="22" rx="4" fill="#fecaca" />
      <path d="M10 10c0-5 5-8 10-8s10 3 10 8" stroke="#ef4444" strokeWidth="2" fill="#fee2e2" />
      <circle cx="20" cy="22" r="6" fill="#f97316" opacity="0.85" />
      <path d="M14 30h12" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** placeholder สำหรับรูปเมนู */
export function IconSkewerPlaceholder({ size = 40, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="34" x2="16" y2="8" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="6" r="4" fill="#ef4444" />
      <line x1="22" y1="34" x2="24" y2="10" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="8" r="4" fill="#f97316" />
      <line x1="28" y1="34" x2="30" y2="12" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="10" r="3.5" fill="#dc2626" />
    </svg>
  );
}

/** ไอคอน + ข้อความแนวนอน */
export function IconLabel({
  icon: Icon,
  children,
  className = "",
  iconClassName = "text-gray-500",
  size = 16,
}: {
  icon: ComponentType<IconProps>;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon size={size} className={`shrink-0 ${iconClassName}`} />
      <span>{children}</span>
    </span>
  );
}
