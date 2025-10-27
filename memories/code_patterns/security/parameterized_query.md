# Pattern: Parameterized Query

**Category:** security
**Language:** sql
**First Detected:** 2025-10-27 11:54
**Times Applied:** 1

## Description

Parameterized SQL query (prevents injection)

## Example

```sql
throw new Error('Invalid email format');
    }

    // Query database (parameterized to prevent SQL injection)
    const user = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
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

```sql
throw new Error('Invalid email format');
    }

    // Query database (parameterized to prevent SQL injection)
    const user = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
```


## Example Added: 2025-10-27 11:55

```sql
throw new Error('Invalid email format');
    }

    // Query database (parameterized to prevent SQL injection)
    const user = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
```
