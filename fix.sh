sed -i -e '/if (!recordsMap.has(period)) addedCount++;/c\
          if (!recordsMap.has(period)) {\
            // Only consider it added if it is NEWER than the oldest record we have, or if we have less than 50\
            if (existing.length < 50 || parseInt(period, 10) > parseInt(existing[existing.length - 1].period, 10)) {\
              addedCount++;\
            }\
          }' functions/api/_shared.ts
