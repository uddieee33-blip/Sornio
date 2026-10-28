//! Native GST arithmetic foundation; not a posting API or tax-classification service.
//! Policy v1: half-up line rounding in paise; split odd intra-state tax to CGST.
//! The caller must determine registration, lawful rates and place of supply.
use crate::catalog::MAX_VALUE;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
#[error("Invalid GST amount, rate, quantity or original tax snapshot")]
pub struct InvalidGst;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub enum Registration {
    Unregistered,
    Regular,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub enum Supply {
    IntraState,
    InterState,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub enum Pricing {
    Exclusive,
    Inclusive,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Amounts {
    pub taxable_paise: i64,
    pub cgst_paise: i64,
    pub sgst_paise: i64,
    pub igst_paise: i64,
    pub total_paise: i64,
}
fn money(n: i128) -> Result<i64, InvalidGst> {
    if !(0..=MAX_VALUE as i128).contains(&n) {
        return Err(InvalidGst);
    }
    Ok(n as i64)
}
fn rounded(n: i128, d: i128) -> Result<i64, InvalidGst> {
    if n < 0 || d <= 0 {
        return Err(InvalidGst);
    }
    money((n + d / 2) / d)
}
impl Amounts {
    fn valid(self) -> Result<(), InvalidGst> {
        for n in [
            self.taxable_paise,
            self.cgst_paise,
            self.sgst_paise,
            self.igst_paise,
            self.total_paise,
        ] {
            money(n as i128)?;
        }
        if (self.igst_paise != 0 && (self.cgst_paise != 0 || self.sgst_paise != 0))
            || self.taxable_paise as i128
                + self.cgst_paise as i128
                + self.sgst_paise as i128
                + self.igst_paise as i128
                != self.total_paise as i128
        {
            return Err(InvalidGst);
        }
        Ok(())
    }
}
/// Rate is combined GST in basis points. Not a validated statutory rate catalogue.
/// Quantity uses the existing native thousandth-unit convention.
pub fn calculate(
    registration: Registration,
    supply: Supply,
    pricing: Pricing,
    quantity_milli: i64,
    unit_price_paise: i64,
    rate_bps: i64,
) -> Result<Amounts, InvalidGst> {
    if !(1..=MAX_VALUE).contains(&quantity_milli)
        || !(0..=MAX_VALUE).contains(&unit_price_paise)
        || !(0..=10_000).contains(&rate_bps)
        || (registration == Registration::Unregistered && rate_bps != 0)
    {
        return Err(InvalidGst);
    }
    let extended = rounded(quantity_milli as i128 * unit_price_paise as i128, 1000)?;
    let (taxable, tax, total) = match pricing {
        Pricing::Exclusive => {
            let tax = rounded(extended as i128 * rate_bps as i128, 10_000)?;
            (extended, tax, money(extended as i128 + tax as i128)?)
        }
        Pricing::Inclusive => {
            let tax = rounded(
                extended as i128 * rate_bps as i128,
                10_000 + rate_bps as i128,
            )?;
            (extended - tax, tax, extended)
        }
    };
    let (cgst, sgst, igst) = match supply {
        Supply::IntraState => ((tax + 1) / 2, tax / 2, 0),
        Supply::InterState => (0, 0, tax),
    };
    let result = Amounts {
        taxable_paise: taxable,
        cgst_paise: cgst,
        sgst_paise: sgst,
        igst_paise: igst,
        total_paise: total,
    };
    result.valid()?;
    Ok(result)
}
/// Cumulative return amounts, not a financial posting or statutory credit note.
/// Subtract the preceding cumulative snapshot under the native writer lock.
/// Hierarchical allocation keeps each component monotonic and full return exact.
/// Always use the immutable posted snapshot, never current prices or tax rates.
pub fn cumulative_return(
    original: Amounts,
    original_quantity: i64,
    returned_quantity: i64,
) -> Result<Amounts, InvalidGst> {
    original.valid()?;
    if !(1..=MAX_VALUE).contains(&original_quantity)
        || !(0..=original_quantity).contains(&returned_quantity)
    {
        return Err(InvalidGst);
    }
    let scale = |n: i64| {
        rounded(
            n as i128 * returned_quantity as i128,
            original_quantity as i128,
        )
    };
    let taxable = scale(original.taxable_paise)?;
    let tax = original.cgst_paise + original.sgst_paise + original.igst_paise;
    let returned_tax = scale(tax)?;
    let cgst = if tax == 0 {
        0
    } else {
        rounded(
            returned_tax as i128 * original.cgst_paise as i128,
            tax as i128,
        )?
    };
    let igst = if original.igst_paise != 0 {
        returned_tax
    } else {
        0
    };
    let result = Amounts {
        taxable_paise: taxable,
        cgst_paise: cgst,
        sgst_paise: returned_tax - cgst - igst,
        igst_paise: igst,
        total_paise: money(taxable as i128 + returned_tax as i128)?,
    };
    result.valid()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regression_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/gst-rounding.json")).unwrap();
        for f in fixtures.as_array().unwrap() {
            let result = calculate(
                serde_json::from_value(f["registration"].clone()).unwrap(),
                serde_json::from_value(f["supply"].clone()).unwrap(),
                serde_json::from_value(f["pricing"].clone()).unwrap(),
                f["quantity"].as_i64().unwrap(),
                f["price"].as_i64().unwrap(),
                f["rate"].as_i64().unwrap(),
            )
            .unwrap();
            assert_eq!(
                result,
                serde_json::from_value(f["expected"].clone()).unwrap(),
                "{}",
                f["name"]
            );
        }
    }
    #[test]
    fn unregistered_cannot_collect_tax_and_inputs_are_bounded() {
        for (q, p, r) in [
            (1000, 100, 500),
            (0, 100, 0),
            (1000, -1, 0),
            (1000, 100, 10001),
            (MAX_VALUE, MAX_VALUE, 0),
        ] {
            assert!(calculate(
                Registration::Unregistered,
                Supply::IntraState,
                Pricing::Exclusive,
                q,
                p,
                r
            )
            .is_err());
        }
        assert!(calculate(
            Registration::Regular,
            Supply::InterState,
            Pricing::Exclusive,
            1000,
            MAX_VALUE,
            10000
        )
        .is_err());
    }
    #[test]
    fn every_partial_return_is_monotonic_and_full_return_exact() {
        for supply in [Supply::IntraState, Supply::InterState] {
            for price in 1..100 {
                for rate in [0, 500, 1800, 2800] {
                    let original = calculate(
                        Registration::Regular,
                        supply,
                        Pricing::Inclusive,
                        1000,
                        price,
                        rate,
                    )
                    .unwrap();
                    let mut previous = cumulative_return(original, 1000, 0).unwrap();
                    assert_eq!(previous.total_paise, 0);
                    for quantity in 1..=1000 {
                        let next = cumulative_return(original, 1000, quantity).unwrap();
                        assert!(
                            next.taxable_paise >= previous.taxable_paise
                                && next.cgst_paise >= previous.cgst_paise
                                && next.sgst_paise >= previous.sgst_paise
                                && next.igst_paise >= previous.igst_paise
                        );
                        previous = next;
                    }
                    assert_eq!(previous, original);
                }
            }
        }
    }
    #[test]
    fn invalid_original_or_excess_return_is_rejected() {
        let original = calculate(
            Registration::Regular,
            Supply::IntraState,
            Pricing::Exclusive,
            1000,
            100,
            1800,
        )
        .unwrap();
        assert!(cumulative_return(original, 1000, 1001).is_err());
        assert!(cumulative_return(original, 0, 0).is_err());
        assert!(cumulative_return(
            Amounts {
                igst_paise: 1,
                ..original
            },
            1000,
            100
        )
        .is_err());
    }
}
