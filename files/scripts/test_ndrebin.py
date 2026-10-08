import unittest
import numpy as np
from NDrebin import NDRebin


class NDRebinTests(unittest.TestCase):
    def test_arraylike_and_upper_endpoint(self):
        for fractional in [False, True]:
            r = NDRebin([10], [1], data_errs=[2], lower=0, upper=1,
                        num_bins=2, fractional=fractional, normalize=False)
            r.run()
            np.testing.assert_allclose(r.n_samples, [0, 1])
            np.testing.assert_allclose(r.binned_data, [np.nan, 10], equal_nan=True)
            np.testing.assert_allclose(r.binned_data_errs, [np.nan, 2], equal_nan=True)

    def test_fractional_weights_between_actual_centers(self):
        # Centers are .3 and .8 because the final bin is shorter.
        r = NDRebin([10], [.55], data_errs=[2], lower=0, upper=1,
                    step_size=.6, fractional=True, normalize=False)
        r.run()
        np.testing.assert_allclose(r.n_samples, [.5, .5])
        np.testing.assert_allclose(r.binned_data, [5, 5])
        np.testing.assert_allclose(r.binned_data_errs, [1, 1])

    def test_fractional_conservation_in_multiple_dimensions(self):
        rng = np.random.default_rng(17)
        data = rng.random(1000)
        coords = rng.random((3, 1000))
        r = NDRebin(data, coords, lower=[0]*3, upper=[1]*3,
                    step_size=[.3,.4,.6], fractional=True, normalize=False)
        r.run()
        self.assertAlmostEqual(np.nansum(r.binned_data), np.sum(data))
        self.assertAlmostEqual(np.sum(r.n_samples), 1000)

    def test_histogram_reference_and_error_propagation(self):
        rng = np.random.default_rng(18)
        coords = rng.random((2, 1000))
        data, errors = rng.random(1000), rng.random(1000)
        r = NDRebin(data, coords, data_errs=errors, lower=[0,0], upper=[1,1],
                    num_bins=[7,9], normalize=False)
        r.run()
        expected, _ = np.histogramdd(coords.T, bins=r.bins_list, weights=data)
        variance, _ = np.histogramdd(coords.T, bins=r.bins_list, weights=errors**2)
        np.testing.assert_allclose(r.binned_data, expected)
        np.testing.assert_allclose(r.binned_data_errs, np.sqrt(variance))

    def test_one_bin_integration_and_repeated_run(self):
        r = NDRebin([1,2,3], [0,.5,1], lower=0, upper=1,
                    step_size=np.inf, fractional=True, normalize=False)
        r.run(); r.run()
        np.testing.assert_allclose(r.binned_data, [6])
        np.testing.assert_allclose(r.n_samples, [3])

    def test_invalid_sizes_and_bins_have_clear_errors(self):
        for opts in [{}, {'num_bins':0}, {'num_bins':1.5}, {'step_size':0}, {'step_size':-1}]:
            with self.subTest(opts=opts), self.assertRaises(ValueError):
                NDRebin([1,2], [0,1], **opts).run()
        with self.assertRaises(ValueError):
            NDRebin([], [], num_bins=2).run()
        with self.assertRaises(ValueError):
            NDRebin([1,2], [0,1], num_bins=2, axes=[[1,0]]).run()


if __name__ == '__main__':
    unittest.main()
