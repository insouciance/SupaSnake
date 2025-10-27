# Pattern: Env Var Secrets

**Category:** security
**Language:** any
**First Detected:** 2025-10-27 11:49
**Times Applied:** 1

## Description

Using environment variables for secrets

## Example

```any
export async function fetchUserProfile(userId: string) {
  try {
    // Use environment variable for API endpoint
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL;

    const response = await fetch(`${apiEndpoint}/users/${userId}`);

    if (!response.ok) {
```

## When to Use

This pattern was automatically detected. Best practices:
- Use when implementing similar functionality
- Maintain consistency across codebase
- Follow security/performance guidelines

## Related Patterns

(Will be linked as more patterns are learned)

---

*This pattern was automatically learned from code changes.*
*Add notes or examples by editing this file.*


## Example Added: 2025-10-27 11:54

```any
export async function authenticateUser(email: string, password: string) {
  try {
    // Use environment variable for database connection
    const dbUrl = process.env.DATABASE_URL;

    // Validate input
    if (!email || !password) {
      throw new Error('Email and password required');
```


## Example Added: 2025-10-27 11:55

```any
export async function authenticateUser(email: string, password: string) {
  try {
    // Use environment variable for database connection
    const dbUrl = process.env.DATABASE_URL;

    // Validate input
    if (!email || !password) {
      throw new Error('Email and password required');
```


## Example Added: 2025-10-27 11:55

```any
export async function authenticateUser(email: string, password: string) {
  try {
    // Use environment variable for database connection
    const dbUrl = process.env.DATABASE_URL;

    // Validate input
    if (!email || !password) {
      throw new Error('Email and password required');
```
