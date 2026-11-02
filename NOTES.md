# NOTES

Saat melakukan testing, ada kendala beberapa test case terdapat perbedaan score antara test case yang diberikan di petunjuk dengan hasil score dari API External Beeceptor, contohnya

Expected Score 49.5
Request

```bash
{
  "NO_CIF": "8100000025",
  "application_id": "APP-20261031-0100",
  "nik": "3578015901900107",
  "identity_confidence": 100
}
```

Response

```bash
{
 "NO_CIF": "8100000020",
 "application_id": "APP-20261031-0101",
 "score": "75",
 "grade": "B",
 "reason_codes": []
}
```

Expected Score 80
Request

```bash
{
  "NO_CIF": "8100000020",
  "application_id": "APP-20261031-0101",
  "nik": "3173057007890301",
  "identity_confidence": 100
}
```

Response

```bash
{
 "NO_CIF": "8100000020",
 "application_id": "APP-20261031-0101",
 "score": "75",
 "grade": "B",
 "reason_codes": []
}
```
