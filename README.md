# 꺼내보카

혼자 쓰는 토익 단어 복습 앱 (안드로이드).

- 뜻을 먼저 떠올리고 확인하는 방식. 복습 날짜는 FSRS(공개 알고리즘, 기본값)로 계산
- 출석 도장, 주 1회 휴식권, 하루 두 번 알림(공부 알림, 출석 마감 알림)
- 기록은 폰 안에만 저장. 설정 > 백업·폰 옮기기에서 백업 파일로 옮김
- 단어는 Claude가 만든 Day 파일(`kind: kkeonae-day`)을 가져와서 추가

## 빌드

`main`에 올리면 GitHub Actions가 설치 파일을 만들어 Releases와 `ci-out` 브랜치에 올린다.

`app/keystore/release.p12`는 업데이트 서명 키라서 지우거나 바꾸면 안 된다.
바뀌면 앱을 지웠다 다시 깔아야 하고, 그때는 백업 파일로 기록을 옮겨야 한다.

## Day 파일 형식

```json
{
  "kind": "kkeonae-day",
  "version": 1,
  "deck": { "id": "toeic-d01", "title": "Day 01", "day": 1 },
  "words": [
    { "id": "toeic-d01-001", "w": "attend", "pos": "동사", "m": "참석하다",
      "ex": "All managers must [attend] the meeting.", "exKo": "모든 관리자는 회의에 참석해야 한다.", "note": "" }
  ]
}
```

예문의 `[ ]` 안이 굵게 표시되고 빈칸 문제에 쓰인다. 같은 `id`로 다시 가져오면 진도는 그대로 두고 내용만 고친다.
`kind: kkeonae-patch`는 기존 단어에 메모(연상법)만 붙일 때 쓴다.

## 폰트

영어 단어는 TeX Gyre Schola (GUST Font License)를 라틴 글자만 잘라서 쓴다.
