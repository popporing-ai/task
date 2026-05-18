-- migration-014: 제품 이름 Bodycam → Scout
-- 실행일: 2026-05-18
-- 변경 사유: 제품 브랜드명 변경에 따른 정합성 유지

-- 1) products 테이블의 Bodycam 행 이름 갱신
UPDATE products SET name = 'Scout' WHERE name = 'Bodycam';

-- 2) Scout 행이 이미 따로 존재해 충돌하면 UPDATE 실패 → 위 쿼리는 ON CONFLICT 없이 단순 갱신이므로
--    Scout 행이 이미 있고 Bodycam 행도 있으면 unique 제약 위반. 그 경우 Bodycam 행만 정리.
DELETE FROM products
 WHERE name = 'Bodycam'
   AND EXISTS (SELECT 1 FROM products WHERE name = 'Scout');
