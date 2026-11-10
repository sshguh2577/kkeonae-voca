# 꺼내보카

혼자 쓰는 토익 단어 복습 앱 (안드로이드).

- 뜻을 먼저 떠올리고 확인하는 방식. 복습 날짜는 FSRS(공개 알고리즘, 기본값)로 계산
- 출석 도장, 주 1회 휴식권, 하루 두 번 알림(공부 알림, 출석 마감 알림)
- 기록은 폰 안에만 저장. 설정 > 백업·폰 옮기기에서 백업 파일로 옮김
- 단어는 Claude가 만든 Day 파일(`kind: kkeonae-day`)을 가져와서 추가
- 1.0.8부터 갈래가 셋이다. 토익(Day 파일, 단어 탭), 전공(금융·보험과 토목, 단어 탭의 전공 칸), 노래(노래 탭).
  토익과 전공은 출석·연속 기록·휴식권을 따로 세고, 노래는 출석 없이 원할 때만 공부한다.
  가져오기 버튼도 갈래마다 따로 있어서 다른 갈래 파일은 받지 않는다
- 1.0.9부터 홈은 위쪽 [토익 | 전공] 버튼으로 고른 쪽만 보여 준다(도장판·오늘 카드가 갈래마다 따로).
  공 캐릭터(`balls.js`)는 컨트리볼 그림체로 직접 그린 그림이다: 파란 공(사서)은 토익·노래, 초록 공(대학생)은 금융·토목.
  국기 무늬는 쓰지 않는다

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

## 전공 단어 파일 형식

```json
{
  "kind": "kkeonae-major",
  "version": 1,
  "decks": [
    { "deck": { "id": "major-fin-1", "title": "금융·보험 1", "major": "fin" }, "words": [ ... ] },
    { "deck": { "id": "major-civ-1", "title": "토목 1", "major": "civ" }, "words": [ ... ] }
  ]
}
```

`major`는 `fin`(금융·보험) 또는 `civ`(토목). 하루에 과목별 `majorPerDay`개(기본 5)씩 순서대로 꺼낸다.
노래 단어 파일은 `kind: kkeonae-song`이고 형식은 Day 파일과 같다.

## 폰트

영어 단어는 TeX Gyre Schola (GUST Font License)를 라틴 글자만 잘라서 쓴다.
