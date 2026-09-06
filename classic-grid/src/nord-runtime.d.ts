declare module "@n1xyz/nord-ts" {
  export const FillMode: {
    PostOnly: unknown;
    ImmediateOrCancel: unknown;
  };
  export const Side: {
    Bid: unknown;
    Ask: unknown;
  };
  export const Nord: any;
  export const NordUser: any;
  export const calcCurrPosLiqPrice: (input: Record<string, unknown>) => unknown;
}
