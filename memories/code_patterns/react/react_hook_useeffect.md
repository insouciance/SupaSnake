# Pattern: React Hook Useeffect

**Category:** react
**Language:** typescript
**First Detected:** 2025-10-27 11:54
**Times Applied:** 1

## Description

useEffect usage pattern

## Example

```typescript
const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userData = await verifyToken(token);
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


## Example Added: 2025-10-27 11:55

```typescript
const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userData = await verifyToken(token);
```


## Example Added: 2025-10-27 11:55

```typescript
const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userData = await verifyToken(token);
```
