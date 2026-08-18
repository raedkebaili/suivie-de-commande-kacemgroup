// Type declarations for external modules without built-in types

declare module 'xlsx' {
  interface WorkBook {
    SheetNames: string[];
    Sheets: { [key: string]: WorkSheet };
    Props?: object;
  }
  
  interface WorkSheet {
    [key: string]: CellObject | object | undefined;
    '!ref'?: string;
    '!margins'?: object;
    '!cols'?: object[];
    '!rows'?: object[];
    '!merges'?: object[];
  }
  
  interface CellObject {
    t: string; // type
    v: string | number | boolean | Date; // value
    r?: string; // rich text
    h?: string; // HTML
    w?: string; // formatted text
    f?: string; // formula
  }
  
  interface WritingOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'file' | 'array' | 'string';
    bookType?: 'xlsx' | 'xlsm' | 'xlsb' | 'xls' | 'biff8' | 'biff5' | 'biff4' | 'biff3' | 'biff2' | 'xlml' | 'ods' | 'fods' | 'csv' | 'txt' | 'sylk' | 'html' | 'dif' | 'rtf' | 'prn' | 'eth';
    sheet?: string;
    compression?: boolean;
    Props?: object;
    cellDates?: boolean;
    bookSST?: boolean;
  }
  
  interface ParsingOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'array' | 'file' | 'string';
    raw?: boolean;
    cellFormula?: boolean;
    cellHTML?: boolean;
    cellNF?: boolean;
    cellStyles?: boolean;
    cellText?: boolean;
    cellDates?: boolean;
    dateNF?: string;
    sheetRows?: number;
    sheets?: number | string | string[];
    bookDeps?: boolean;
    bookFiles?: boolean;
    bookProps?: boolean;
    bookSheets?: boolean;
    bookVBA?: boolean;
    password?: string;
  }
  
  interface Sheet2JSONOptions {
    header?: 'A' | number | string[];
    dateNF?: string;
    defval?: unknown;
    blankrows?: boolean;
    raw?: boolean;
    rawNumbers?: boolean;
  }
  
  interface JSON2SheetOptions {
    header?: string[];
    dateNF?: string;
    cellDates?: boolean;
    skipHeader?: boolean;
    origin?: string | { r: number; c: number };
  }
  
  function read(data: ArrayBuffer | Buffer | string | Uint8Array, opts?: ParsingOptions): WorkBook;
  function write(wb: WorkBook, opts?: WritingOptions): Buffer | string | ArrayBuffer | Uint8Array;
  function writeFile(wb: WorkBook, filename: string, opts?: WritingOptions): void;
  
  namespace utils {
    function sheet_to_json<T = Record<string, unknown>>(sheet: WorkSheet, opts?: Sheet2JSONOptions): T[];
    function json_to_sheet<T = Record<string, unknown>>(data: T[], opts?: JSON2SheetOptions): WorkSheet;
    function book_new(): WorkBook;
    function book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
    function aoa_to_sheet<T = unknown>(data: T[][]): WorkSheet;
    function decode_range(range: string): { s: { r: number; c: number }; e: { r: number; c: number } };
    function encode_cell(cell: { r: number; c: number }): string;
  }
}

declare module 'recharts' {
  import { FC, ReactNode, CSSProperties } from 'react';

  interface CommonProps {
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
  }

  interface ResponsiveContainerProps extends CommonProps {
    width?: string | number;
    height?: string | number;
    aspect?: number;
    minWidth?: number;
    minHeight?: number;
    debounce?: number;
  }

  interface ChartProps extends CommonProps {
    data?: object[];
    width?: number;
    height?: number;
    layout?: 'horizontal' | 'vertical';
    margin?: { top?: number; right?: number; bottom?: number; left?: number };
  }

  interface AxisProps extends CommonProps {
    dataKey?: string;
    type?: 'number' | 'category';
    tick?: object | boolean | ReactNode | FC;
    stroke?: string;
    hide?: boolean;
    width?: number;
    allowDecimals?: boolean;
  }

  interface CartesianGridProps extends CommonProps {
    strokeDasharray?: string;
    stroke?: string;
    horizontal?: boolean;
    vertical?: boolean;
  }

  interface TooltipProps extends CommonProps {
    content?: ReactNode | FC;
    formatter?: (value: unknown, name: string, props: object) => ReactNode;
    labelFormatter?: (label: unknown) => ReactNode;
  }

  interface LegendProps extends CommonProps {
    verticalAlign?: 'top' | 'middle' | 'bottom';
    align?: 'left' | 'center' | 'right';
    formatter?: (value: string) => ReactNode;
  }

  interface BarProps extends CommonProps {
    dataKey: string;
    fill?: string;
    name?: string;
    radius?: number | [number, number, number, number];
    barSize?: number;
  }

  interface LineProps extends CommonProps {
    dataKey: string;
    stroke?: string;
    strokeWidth?: number;
    type?: 'basis' | 'basisClosed' | 'basisOpen' | 'linear' | 'linearClosed' | 'natural' | 'monotoneX' | 'monotoneY' | 'monotone' | 'step' | 'stepBefore' | 'stepAfter';
    dot?: boolean | object | ReactNode | FC;
    name?: string;
  }

  interface PieProps extends CommonProps {
    data?: object[];
    dataKey: string;
    cx?: string | number;
    cy?: string | number;
    innerRadius?: number;
    outerRadius?: number;
    paddingAngle?: number;
    fill?: string;
    label?: boolean | object | ReactNode | FC;
  }

  interface CellProps extends CommonProps {
    fill?: string;
    stroke?: string;
  }

  export const ResponsiveContainer: FC<ResponsiveContainerProps>;
  export const BarChart: FC<ChartProps>;
  export const LineChart: FC<ChartProps>;
  export const PieChart: FC<ChartProps>;
  export const Bar: FC<BarProps>;
  export const Line: FC<LineProps>;
  export const Pie: FC<PieProps>;
  export const Cell: FC<CellProps>;
  export const XAxis: FC<AxisProps>;
  export const YAxis: FC<AxisProps>;
  export const CartesianGrid: FC<CartesianGridProps>;
  export const Tooltip: FC<TooltipProps>;
  export const Legend: FC<LegendProps>;
}

declare module 'jose' {
  export interface JWTPayload {
    [key: string]: unknown;
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
  }

  export interface JWTVerifyResult {
    payload: JWTPayload;
    protectedHeader: { alg: string; typ?: string };
  }

  export class SignJWT {
    constructor(payload: JWTPayload);
    setProtectedHeader(protectedHeader: { alg: string; typ?: string }): this;
    setExpirationTime(exp: string | number): this;
    setIssuedAt(iat?: number): this;
    setNotBefore(nbf: string | number): this;
    setIssuer(issuer: string): this;
    setSubject(subject: string): this;
    setAudience(audience: string | string[]): this;
    setJti(jti: string): this;
    sign(key: Uint8Array | CryptoKey): Promise<string>;
  }

  export function jwtVerify(
    jwt: string,
    key: Uint8Array | CryptoKey,
    options?: { algorithms?: string[]; audience?: string | string[]; issuer?: string | string[] }
  ): Promise<JWTVerifyResult>;
}

declare module 'bcryptjs' {
  export function hash(s: string, salt: number | string): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function genSalt(rounds?: number): Promise<string>;
  export function hashSync(s: string, salt: number | string): string;
  export function compareSync(s: string, hash: string): boolean;
  export function genSaltSync(rounds?: number): string;
}
