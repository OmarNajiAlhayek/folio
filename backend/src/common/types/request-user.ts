export type RequestUser = {
  sub: string;
  email: string;
  roleSlugs: string[];
  permissionSlugs: string[];
};
